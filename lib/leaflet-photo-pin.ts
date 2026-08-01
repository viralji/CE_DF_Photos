/** Shared Leaflet divIcon HTML for checkpoint-style photo location pins (matches main Map). */

export const PHOTO_LOCATION_PIN_CLASS_NAME = 'ce-df-photos-location-marker';
export const PHOTO_LOCATION_PIN_ICON_SIZE = [28, 28] as const;
export const PHOTO_LOCATION_PIN_ICON_ANCHOR = [14, 28] as const;

function escapeHtmlAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/** SVG pin HTML: teardrop + white dot, colored fill, drop-shadow. */
export function photoLocationPinIconHtml(color: string, title = 'Photo location'): string {
  const escaped = color.replace(/"/g, '&quot;');
  const titleAttr = escapeHtmlAttr(title);
  return `<div style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.3));" title="${titleAttr}">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="${escaped}" style="fill:${escaped}"/>
      <circle cx="12" cy="9" r="2.5" fill="white"/>
    </svg>
  </div>`;
}
