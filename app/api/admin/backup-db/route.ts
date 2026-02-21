import { NextRequest, NextResponse } from 'next/server';
import { getSessionWithRole } from '@/lib/auth-helpers';
import { getDatabasePath } from '@/lib/db';
import { logError } from '@/lib/safe-log';
import * as fs from 'fs/promises';
import * as path from 'path';

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionWithRole(request);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (session.role !== 'Admin') {
      return NextResponse.json({ error: 'Only Admin can download DB backup' }, { status: 403 });
    }

    const dbPath = getDatabasePath();
    try {
      await fs.access(dbPath, fs.constants.R_OK);
    } catch {
      return NextResponse.json({ error: 'Database file not found or not readable' }, { status: 404 });
    }

    const buffer = await fs.readFile(dbPath);
    const date = new Date().toISOString().slice(0, 10);
    const basename = path.basename(dbPath, path.extname(dbPath)) || 'ce_df_photos';
    const filename = `${basename}_backup_${date}.db`;

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/x-sqlite3',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(buffer.length),
      },
    });
  } catch (error: unknown) {
    logError('Backup DB', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
