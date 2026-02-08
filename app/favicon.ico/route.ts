import { NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

export function GET() {
  const svgPath = path.join(process.cwd(), 'public', 'cloudextel-logo.svg');
  try {
    const body = fs.readFileSync(svgPath, 'utf-8');
    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
