/**
 * Server-side reverse geocode (Nominatim). Used for burning location into photos and by /api/geocode.
 */
const NOMINATIM_USER_AGENT = 'CE-DF-Photos/1.0 (contact@cloudextel.com)';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

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
  neighbourhood?: string;
  county?: string;
  state?: string;
  state_district?: string;
  municipality?: string;
  [key: string]: string | undefined;
};

type NominatimResult = { address?: NominatimAddress; display_name?: string };

function extractPlaceAndState(address: NominatimAddress | undefined, displayName?: string): { place: string | null; state: string | null } {
  if (!address) {
    if (displayName && typeof displayName === 'string') {
      const parts = displayName.split(',').map((p) => p.trim()).filter(Boolean);
      if (parts.length >= 2) return { place: parts[0] ?? null, state: parts[parts.length - 1] ?? null };
      if (parts.length === 1) return { place: parts[0], state: null };
    }
    return { place: null, state: null };
  }
  const place =
    address.village ?? address.town ?? address.city ?? address.suburb ?? address.neighbourhood ?? address.municipality ?? address.county ?? null;
  const state = address.state ?? address.state_district ?? null;
  return { place, state };
}

export async function reverseGeocode(lat: number, lon: number): Promise<{ place: string | null; state: string | null }> {
  const key = cacheKey(lat, lon);
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) {
    return { place: cached.place, state: cached.state };
  }

  try {
    await new Promise((r) => setTimeout(r, 1100));
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`;
    const res = await fetch(url, {
      headers: { 'User-Agent': NOMINATIM_USER_AGENT },
    });
    if (!res.ok) return { place: null, state: null };
    const data = (await res.json()) as NominatimResult;
    const { place, state } = extractPlaceAndState(data.address, data.display_name);
    cache.set(key, { place, state, expiresAt: now + CACHE_TTL_MS });
    return { place, state };
  } catch {
    return { place: null, state: null };
  }
}

/** Returns "Place, State" or "Place" or "State" for burning into photo. */
export function formatLocationForBurn(place: string | null, state: string | null): string | null {
  const parts = [place, state].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : null;
}
