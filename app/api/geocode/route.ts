import { NextRequest, NextResponse } from 'next/server';
import { getSessionOrDevBypass } from '@/lib/auth-helpers';

const NOMINATIM_USER_AGENT = 'CE-DF-Photos/1.0 (contact@cloudextel.com)';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

type CacheEntry = { place: string | null; state: string | null; expiresAt: number };
const cache = new Map<string, CacheEntry>();

function roundCoord(n: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  return Math.round(n * f) / f;
}

function cacheKey(lat: number, lon: number): string {
  return `${roundCoord(lat, 3)}_${roundCoord(lon, 3)}`;
}

type NominatimAddress = {
  village?: string;
  town?: string;
  city?: string;
  suburb?: string;
  state?: string;
  state_district?: string;
};

type NominatimResult = { address?: NominatimAddress };

function extractPlaceAndState(address: NominatimAddress | undefined): { place: string | null; state: string | null } {
  if (!address) return { place: null, state: null };
  const place =
    address.village ?? address.town ?? address.city ?? address.suburb ?? null;
  const state = address.state ?? address.state_district ?? null;
  return { place, state };
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionOrDevBypass(request);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const latParam = searchParams.get('lat');
    const lonParam = searchParams.get('lon');

    const lat = latParam != null ? parseFloat(latParam) : NaN;
    const lon = lonParam != null ? parseFloat(lonParam) : NaN;

    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      return NextResponse.json({ error: 'Invalid lat' }, { status: 400 });
    }
    if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
      return NextResponse.json({ error: 'Invalid lon' }, { status: 400 });
    }

    const key = cacheKey(lat, lon);
    const now = Date.now();
    const cached = cache.get(key);
    if (cached && cached.expiresAt > now) {
      return NextResponse.json({ place: cached.place, state: cached.state });
    }

    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`;
    const res = await fetch(url, {
      headers: { 'User-Agent': NOMINATIM_USER_AGENT },
    });

    if (!res.ok) {
      return NextResponse.json({ place: null, state: null }, { status: 200 });
    }

    const data = (await res.json()) as NominatimResult;
    const { place, state } = extractPlaceAndState(data.address);

    cache.set(key, {
      place,
      state,
      expiresAt: now + CACHE_TTL_MS,
    });

    return NextResponse.json({ place, state });
  } catch (error: unknown) {
    return NextResponse.json({ place: null, state: null }, { status: 200 });
  }
}
