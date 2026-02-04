/**
 * Capture session: last capture location is persisted so the 40 m rule
 * applies across page refreshes and navigations. Session = until user logs out.
 * Cleared on sign-out so the next login gets "first photo allowed".
 */

export const CAPTURE_LAST_LOCATION_KEY = 'ce-df-photos-last-capture';

export function loadLastCaptureLocation(): { latitude: number; longitude: number } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CAPTURE_LAST_LOCATION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { latitude?: number; longitude?: number };
    if (typeof parsed?.latitude !== 'number' || typeof parsed?.longitude !== 'number') return null;
    return { latitude: parsed.latitude, longitude: parsed.longitude };
  } catch {
    return null;
  }
}

export function saveLastCaptureLocation(loc: { latitude: number; longitude: number } | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (loc) localStorage.setItem(CAPTURE_LAST_LOCATION_KEY, JSON.stringify(loc));
    else localStorage.removeItem(CAPTURE_LAST_LOCATION_KEY);
  } catch {
    // ignore
  }
}

/** Call on logout so the next session gets first-photo-allowed. */
export function clearCaptureSession(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(CAPTURE_LAST_LOCATION_KEY);
  } catch {
    // ignore
  }
}
