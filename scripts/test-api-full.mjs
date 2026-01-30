/**
 * Full API test. Run against a running server: node scripts/test-api-full.mjs [baseUrl]
 * Example: npm run dev & sleep 5 && node scripts/test-api-full.mjs http://127.0.0.1:3000
 */
const BASE = process.argv[2] || 'http://127.0.0.1:3000';
const COOKIE = 'dev-bypass-auth=true';
let failed = 0;

async function req(method, path, body, opts = {}) {
  const url = path.startsWith('http') ? path : BASE + path;
  const headers = { ...opts.headers, Cookie: COOKIE };
  if (body && typeof body === 'object' && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(url, { method, headers, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (_) {}
  return { status: res.status, json, text };
}

function ok(name, condition, detail = '') {
  if (condition) {
    console.log('✓', name, detail);
  } else {
    console.error('✗', name, detail);
    failed++;
  }
}

async function main() {
  console.log('Testing', BASE, 'with dev-bypass cookie\n');

  let r;

  r = await req('GET', '/');
  ok('GET /', r.status === 200 || r.status === 307, r.status);

  const noCookie = await fetch(BASE + '/api/routes');
  ok('GET /api/routes without cookie returns 401', noCookie.status === 401, noCookie.status);

  r = await req('GET', '/api/routes');
  ok('GET /api/routes', r.status === 200 && Array.isArray(r.json?.routes), r.status);

  r = await req('GET', '/api/checkpoints');
  ok('GET /api/checkpoints', r.status === 200 && Array.isArray(r.json?.checkpoints), r.status);

  r = await req('GET', '/api/entities');
  ok('GET /api/entities', r.status === 200, r.status);

  r = await req('GET', '/api/review/summary');
  ok('GET /api/review/summary', r.status === 200 && Array.isArray(r.json?.summary), r.status);

  const e2eRouteId = 'e2e-' + Date.now();
  r = await req('POST', '/api/routes', { route_id: e2eRouteId, route_name: 'E2E Test Route' });
  ok('POST /api/routes (create)', r.status === 200 || r.status === 201, r.status);
  const routeCreated = r.status === 200 || r.status === 201;

  r = await req('GET', '/api/subsections?route_id=' + e2eRouteId);
  ok('GET /api/subsections', r.status === 200 && Array.isArray(r.json?.subsections), r.status);

  if (routeCreated) {
    r = await req('POST', '/api/subsections', { route_id: e2eRouteId, subsection_id: 1, subsection_name: 'E2E Subsection' });
    ok('POST /api/subsections', r.status === 200 || r.status === 201, r.status);
  }

  r = await req('GET', '/api/photos?routeId=' + e2eRouteId + '&subsectionId=1&limit=10');
  ok('GET /api/photos', r.status === 200 && Array.isArray(r.json?.photos), r.status);

  r = await req('GET', '/api/photos?routeId=1&subsectionId=1&limit=5');
  ok('GET /api/photos (params)', r.status === 200, r.status);

  // Photo image proxy: need a real photo id (try any route first, then fallback to 1/1)
  let photosList = (await req('GET', '/api/photos?limit=1')).json?.photos;
  if (!Array.isArray(photosList) || !photosList[0]?.id) {
    photosList = (await req('GET', '/api/photos?routeId=1&subsectionId=1&limit=1')).json?.photos;
  }
  const photoId = Array.isArray(photosList) && photosList[0]?.id != null ? photosList[0].id : null;
  if (photoId != null) {
    r = await fetch(BASE + '/api/photos/' + photoId + '/image', { headers: { Cookie: COOKIE } });
    const ct = r.headers.get('content-type') || '';
    const buf = await r.arrayBuffer();
    ok('GET /api/photos/:id/image (with photo)', r.status === 200 && ct.startsWith('image/') && buf.byteLength > 0, `status=${r.status} contentType=${ct} size=${buf.byteLength}`);
  } else {
    // No photos in DB: test 404 for invalid id
    r = await fetch(BASE + '/api/photos/99999999/image', { headers: { Cookie: COOKIE } });
    ok('GET /api/photos/:id/image (404 for missing)', r.status === 404, r.status);
  }
  // Unauthorized image request
  const imgNoCookie = await fetch(BASE + '/api/photos/1/image');
  ok('GET /api/photos/:id/image without cookie returns 401', imgNoCookie.status === 401, imgNoCookie.status);

  console.log('');
  if (failed > 0) {
    console.error(failed, 'test(s) failed');
    process.exit(1);
  }
  console.log('All API tests passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
