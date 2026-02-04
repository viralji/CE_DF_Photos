import { NextRequest, NextResponse } from 'next/server';
import { getSessionWithRole } from '@/lib/auth-helpers';
import { getDb } from '@/lib/db';
import * as XLSX from 'xlsx';

const DEFAULT_REPORT_NAME = 'DF QC App Report';
const ROUTE_ID_START = 1001;
const SUBSECTION_ID_START = 10001;

function normalizeKey(key: string): string {
  return String(key)
    .toLowerCase()
    .replace(/\s+/g, '_')
    .trim();
}

function getCell(row: Record<string, unknown>, keyVariants: string[]): string | null {
  const normalized: Record<string, unknown> = {};
  for (const k of Object.keys(row)) {
    normalized[normalizeKey(k)] = row[k];
  }
  for (const v of keyVariants) {
    const val = normalized[normalizeKey(v)];
    if (val != null && String(val).trim() !== '') return String(val).trim();
  }
  return null;
}

function getCellNumber(row: Record<string, unknown>, keyVariants: string[]): number | null {
  const s = getCell(row, keyVariants);
  if (s == null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

type SyncRow = { routeName: string; subsectionName: string; routeLength: number | null; subsectionLength: number | null };

const UG_VARIANTS = ['UG Route', 'ug_route', 'UG_Route', 'Ug Route'];
const SLD_VARIANTS = ['SLD Name', 'sld_name', 'SLD_Name', 'Sld Name'];
const ROUTE_LENGTH_VARIANTS = ['route_length', 'Route Length', 'route length'];
const SUBSECTION_LENGTH_VARIANTS = ['subsection_length', 'Subsection Length', 'subsection length'];

function parseRowsFromJson(resultData: unknown[]): SyncRow[] {
  const pairs: SyncRow[] = [];
  for (const row of resultData) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const routeName = getCell(r, UG_VARIANTS);
    const subsectionName = getCell(r, SLD_VARIANTS);
    if (routeName && subsectionName) {
      pairs.push({
        routeName,
        subsectionName,
        routeLength: getCellNumber(r, ROUTE_LENGTH_VARIANTS),
        subsectionLength: getCellNumber(r, SUBSECTION_LENGTH_VARIANTS),
      });
    }
  }
  return pairs;
}

function parseRowsFromSheet(rows: unknown[][]): SyncRow[] {
  if (rows.length < 2) return [];
  const header = rows[0] as string[];
  const ugIdx = header.findIndex((h) => normalizeKey(String(h ?? '')) === 'ug_route');
  const sldIdx = header.findIndex((h) => normalizeKey(String(h ?? '')) === 'sld_name');
  const routeLengthIdx = header.findIndex((h) => normalizeKey(String(h ?? '')) === 'route_length');
  const subsectionLengthIdx = header.findIndex((h) => normalizeKey(String(h ?? '')) === 'subsection_length');
  if (ugIdx === -1 || sldIdx === -1) return [];

  const pairs: SyncRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as unknown[];
    const routeName = row[ugIdx] != null ? String(row[ugIdx]).trim() : '';
    const subsectionName = row[sldIdx] != null ? String(row[sldIdx]).trim() : '';
    if (routeName && subsectionName) {
      const routeLength = routeLengthIdx >= 0 && row[routeLengthIdx] != null && row[routeLengthIdx] !== ''
        ? (() => { const n = Number(row[routeLengthIdx]); return Number.isFinite(n) ? n : null; })()
        : null;
      const subsectionLength = subsectionLengthIdx >= 0 && row[subsectionLengthIdx] != null && row[subsectionLengthIdx] !== ''
        ? (() => { const n = Number(row[subsectionLengthIdx]); return Number.isFinite(n) ? n : null; })()
        : null;
      pairs.push({ routeName, subsectionName, routeLength, subsectionLength });
    }
  }
  return pairs;
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionWithRole(request);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (session.role !== 'Admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const erpnextUrl = process.env.ERPNEXT_URL?.trim();
    const apiKey = process.env.ERPNEXT_API_KEY?.trim();
    const apiSecret = process.env.ERPNEXT_API_SECRET?.trim();
    const reportName = (process.env.ERPNEXT_REPORT_NAME || DEFAULT_REPORT_NAME).trim();

    if (!erpnextUrl || !apiKey || !apiSecret) {
      return NextResponse.json(
        {
          error: 'ERPNext configuration missing',
          message:
            'Please configure ERPNEXT_URL, ERPNEXT_API_KEY, and ERPNEXT_API_SECRET in environment variables.',
        },
        { status: 400 }
      );
    }

    const reportUrl = `${erpnextUrl.replace(/\/$/, '')}/api/method/frappe.desk.query_report.run?report_name=${encodeURIComponent(reportName)}&format=Excel`;
    const authToken = `token ${apiKey}:${apiSecret}`;

    const response = await fetch(reportUrl, {
      method: 'GET',
      headers: {
        Authorization: authToken,
        Accept:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `ERPNext API error: ${response.status} ${response.statusText}`;
      try {
        const errJson = JSON.parse(errorText);
        errorMessage = (errJson as { message?: string; error?: string }).message ?? (errJson as { message?: string; error?: string }).error ?? errorMessage;
      } catch {
        if (errorText) errorMessage = errorText.substring(0, 200);
      }
      if (response.status === 401 || response.status === 403) {
        return NextResponse.json(
          { error: 'Authentication failed', message: 'Invalid API credentials or insufficient permissions.' },
          { status: 401 }
        );
      }
      return NextResponse.json(
        { error: 'Failed to fetch report from ERPNext', message: errorMessage },
        { status: response.status }
      );
    }

    const contentType = response.headers.get('content-type') || '';
    let pairs: SyncRow[] = [];

    if (contentType.includes('application/json')) {
      const jsonResponse = (await response.json()) as Record<string, unknown> & {
        result?: unknown[];
        message?: unknown[] | { result?: unknown[] };
        exc_type?: unknown;
        exc?: unknown;
      };
      if (jsonResponse.exc_type || jsonResponse.exc || (typeof jsonResponse.error === 'string' && !jsonResponse.result)) {
        return NextResponse.json(
          {
            error: 'ERPNext returned error',
            message:
              (jsonResponse as { message?: string }).message ?? (jsonResponse as { error?: string }).error ?? 'Unknown error from ERPNext',
          },
          { status: 500 }
        );
      }
      let resultData: unknown[] | null = null;
      if (Array.isArray(jsonResponse.result)) resultData = jsonResponse.result;
      else if (Array.isArray(jsonResponse)) resultData = jsonResponse;
      else if (Array.isArray(jsonResponse.message)) resultData = jsonResponse.message;
      else if (
        jsonResponse.message &&
        typeof jsonResponse.message === 'object' &&
        Array.isArray((jsonResponse.message as { result?: unknown[] }).result)
      ) {
        resultData = (jsonResponse.message as { result: unknown[] }).result;
      }
      if (!resultData || resultData.length === 0) {
        return NextResponse.json(
          {
            error: 'Invalid data',
            message: `ERPNext returned empty or invalid data. Response keys: ${Object.keys(jsonResponse).join(', ')}`,
          },
          { status: 400 }
        );
      }
      pairs = parseRowsFromJson(resultData);
    } else {
      const buffer = await response.arrayBuffer();
      if (!buffer || buffer.byteLength === 0) {
        return NextResponse.json(
          { error: 'Empty response', message: 'ERPNext returned empty Excel file.' },
          { status: 500 }
        );
      }
      const workbook = XLSX.read(Buffer.from(buffer), { type: 'buffer' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' }) as unknown[][];
      pairs = parseRowsFromSheet(rows);
    }

    if (pairs.length === 0) {
      return NextResponse.json(
        { error: 'No data', message: 'Report has no rows with UG Route and SLD Name, or column names are missing.' },
        { status: 400 }
      );
    }

    const db = getDb();

    const allRoutes = db.prepare('SELECT route_id, route_name, length FROM routes').all() as {
      route_id: string;
      route_name: string;
      length?: number | null;
    }[];
    const allSubsections = db
      .prepare('SELECT route_id, subsection_id, subsection_name, length FROM subsections')
      .all() as { route_id: string; subsection_id: string; subsection_name: string; length?: number | null }[];

    let nextRouteId = ROUTE_ID_START;
    for (const r of allRoutes) {
      const n = parseInt(r.route_id, 10);
      if (!Number.isNaN(n) && n >= ROUTE_ID_START && n >= nextRouteId) nextRouteId = n + 1;
    }

    let nextSubsectionId = SUBSECTION_ID_START;
    for (const s of allSubsections) {
      const n = parseInt(s.subsection_id, 10);
      if (!Number.isNaN(n) && n >= SUBSECTION_ID_START && n >= nextSubsectionId)
        nextSubsectionId = n + 1;
    }

    const routeByName = new Map<string, string>();
    for (const r of allRoutes) {
      routeByName.set(r.route_name.trim(), r.route_id);
    }

    const subsectionByRouteAndName = new Set<string>();
    for (const s of allSubsections) {
      subsectionByRouteAndName.add(`${s.route_id}::${s.subsection_name.trim()}`);
    }

    const insertRoute = db.prepare(
      'INSERT INTO routes (route_id, route_name, length) VALUES (?, ?, ?)'
    );
    const insertSubsection = db.prepare(
      'INSERT INTO subsections (route_id, subsection_id, subsection_name, length) VALUES (?, ?, ?, ?)'
    );
    const updateRouteLength = db.prepare(
      'UPDATE routes SET length = ?, updated_at = CURRENT_TIMESTAMP WHERE route_id = ?'
    );
    const updateSubsectionLength = db.prepare(
      'UPDATE subsections SET length = ?, updated_at = CURRENT_TIMESTAMP WHERE route_id = ? AND subsection_id = ?'
    );

    let routesAdded = 0;
    let subsectionsAdded = 0;

    const distinctRouteNames = [...new Set(pairs.map((p) => p.routeName))];
    for (const routeName of distinctRouteNames) {
      const firstPair = pairs.find((p) => p.routeName === routeName);
      const routeLength = firstPair?.routeLength ?? null;
      if (routeByName.has(routeName)) {
        const rid = routeByName.get(routeName)!;
        updateRouteLength.run(routeLength != null ? routeLength : null, rid);
        continue;
      }
      const rid = String(nextRouteId++);
      insertRoute.run(rid, routeName, routeLength != null ? routeLength : null);
      routeByName.set(routeName, rid);
      routesAdded++;
    }

    for (const { routeName, subsectionName, subsectionLength } of pairs) {
      const routeId = routeByName.get(routeName);
      if (!routeId) continue;
      const key = `${routeId}::${subsectionName}`;
      const existingSub = allSubsections.find(
        (s) => s.route_id === routeId && s.subsection_name.trim() === subsectionName.trim()
      );
      if (subsectionByRouteAndName.has(key)) {
        if (existingSub) {
          updateSubsectionLength.run(subsectionLength != null ? subsectionLength : null, routeId, existingSub.subsection_id);
        }
        continue;
      }
      const sid = String(nextSubsectionId++);
      insertSubsection.run(routeId, sid, subsectionName, subsectionLength != null ? subsectionLength : null);
      subsectionByRouteAndName.add(key);
      subsectionsAdded++;
    }

    return NextResponse.json({
      success: true,
      message: `Synced: ${routesAdded} route(s) and ${subsectionsAdded} subsection(s) added. Lengths updated for existing routes and subsections.`,
      routesAdded,
      subsectionsAdded,
    });
  } catch (error: unknown) {
    const err = error as NodeJS.ErrnoException;
    console.error('Sync ERPNext error:', error);
    if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
      return NextResponse.json(
        { error: 'Connection failed', message: `Cannot connect to ERPNext server: ${err.message}` },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to sync from ERPNext', message: (err as Error).message },
      { status: 500 }
    );
  }
}
