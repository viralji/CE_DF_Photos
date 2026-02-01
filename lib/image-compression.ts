import sharp from 'sharp';
import * as path from 'path';
import * as fs from 'fs';

export interface CompressionOptions {
  quality?: number;
  maxWidth?: number;
  maxHeight?: number;
  format?: 'jpeg' | 'webp';
}

export async function compressImage(
  buffer: Buffer,
  options: CompressionOptions = {}
): Promise<Buffer> {
  const { quality = 85, maxWidth = 1920, maxHeight = 1920, format = 'jpeg' } = options;
  let pipeline = sharp(buffer).resize(maxWidth, maxHeight, {
    fit: 'inside',
    withoutEnlargement: true,
  });
  if (format === 'webp') {
    pipeline = pipeline.webp({ quality });
  } else {
    pipeline = pipeline.jpeg({ quality, mozjpeg: true });
  }
  return pipeline.toBuffer();
}

export async function getImageMetadata(buffer: Buffer): Promise<{
  width: number;
  height: number;
  format: string;
  size: number;
}> {
  const metadata = await sharp(buffer).metadata();
  return {
    width: metadata.width || 0,
    height: metadata.height || 0,
    format: metadata.format || 'unknown',
    size: buffer.length,
  };
}

export interface GeoOverlayOptions {
  width: number;
  height: number;
  latitude: number;
  longitude: number;
  accuracy?: number;
  /** Pre-formatted timestamp (e.g. IST) to burn; same logic as filename. */
  timestamp?: string;
  /** Location name (e.g. "G/N Ward, Maharashtra") to burn. */
  location?: string | null;
}

function escapeSvgText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Width of the geo overlay box (shaded area only around text). */
const GEO_OVERLAY_WIDTH = 340;
const GEO_OVERLAY_PADDING = 12;
/** Logo square size = geo box height. Logo path relative to cwd. */
const LOGO_FILENAME = 'Logo_New.png';

const logoCache = new Map<number, Buffer | null>();

/** Clear logo cache (e.g. after changing logo). */
export function clearLogoCache(): void {
  logoCache.clear();
}

/** Load logo once per size and cache; resize to square, use as-is (no white removal). */
async function loadLogoSquare(overlayHeight: number): Promise<Buffer | null> {
  const cached = logoCache.get(overlayHeight);
  if (cached !== undefined) return cached;
  const logoPath = path.join(process.cwd(), LOGO_FILENAME);
  if (!fs.existsSync(logoPath)) {
    logoCache.set(overlayHeight, null);
    return null;
  }
  try {
    const buffer = await sharp(logoPath)
      .resize(overlayHeight, overlayHeight, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    logoCache.set(overlayHeight, buffer);
    return buffer;
  } catch {
    logoCache.set(overlayHeight, null);
    return null;
  }
}

export async function burnGeoOverlay(
  imageBuffer: Buffer,
  options: GeoOverlayOptions
): Promise<Buffer> {
  const { width, height, latitude, longitude, accuracy, timestamp, location } = options;
  const line1 = `${latitude.toFixed(5)}° ${latitude >= 0 ? 'N' : 'S'}, ${longitude.toFixed(5)}° ${longitude >= 0 ? 'E' : 'W'}`;
  const line2Parts: string[] = [];
  if (accuracy != null) line2Parts.push(`±${Math.round(accuracy)} m`);
  if (timestamp) line2Parts.push(timestamp);
  const line2 = line2Parts.join(' ');
  const hasLocation = location && location.trim().length > 0;
  const overlayHeight = hasLocation ? 104 : 80;
  const line1y = 28;
  const line2y = 52;
  const line3y = 76;
  const textEls = [
    `<text x="${GEO_OVERLAY_PADDING}" y="${line1y}" font-family="monospace" font-size="14" fill="white">${escapeSvgText(line1)}</text>`,
    `<text x="${GEO_OVERLAY_PADDING}" y="${line2y}" font-family="monospace" font-size="12" fill="white">${escapeSvgText(line2)}</text>`,
  ];
  if (hasLocation) {
    textEls.push(`<text x="${GEO_OVERLAY_PADDING}" y="${line3y}" font-family="monospace" font-size="12" fill="white">${escapeSvgText(location.trim())}</text>`);
  }
  const textBoxWidth = GEO_OVERLAY_WIDTH;
  const logoSize = overlayHeight;
  const totalBarWidth = textBoxWidth + logoSize;
  const svg = `
    <svg width="${totalBarWidth}" height="${overlayHeight}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="rgba(0,0,0,0.6)"/>
      ${textEls.join('\n      ')}
    </svg>
  `;
  const shadeOverlay = Buffer.from(svg);
  const left = width - totalBarWidth;
  const top = 0;

  const composites: { input: Buffer; top: number; left: number }[] = [{ input: shadeOverlay, top, left }];
  const logoBuffer = await loadLogoSquare(overlayHeight);
  if (logoBuffer) {
    composites.push({ input: logoBuffer, top, left: width - logoSize });
  }

  return sharp(imageBuffer).composite(composites).toBuffer();
}
