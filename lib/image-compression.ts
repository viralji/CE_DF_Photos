import sharp from 'sharp';

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
    `<text x="12" y="${line1y}" font-family="monospace" font-size="14" fill="white">${escapeSvgText(line1)}</text>`,
    `<text x="12" y="${line2y}" font-family="monospace" font-size="12" fill="white">${escapeSvgText(line2)}</text>`,
  ];
  if (hasLocation) {
    textEls.push(`<text x="12" y="${line3y}" font-family="monospace" font-size="12" fill="white">${escapeSvgText(location.trim())}</text>`);
  }
  const svg = `
    <svg width="${width}" height="${overlayHeight}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="rgba(0,0,0,0.6)"/>
      ${textEls.join('\n      ')}
    </svg>
  `;
  const overlay = Buffer.from(svg);
  return sharp(imageBuffer)
    .composite([{ input: overlay, top: height - overlayHeight, left: 0 }])
    .toBuffer();
}
