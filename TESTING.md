# Testing CE DF Photos

## Prerequisites

- Node.js 18+
- `.env` configured (NEXTAUTH_*, AZURE_AD_*, AWS_*, DATABASE_PATH)
- Database: run **one** of:
  - `npm run db:setup` then `npm run seed:checkpoints` (uses tsx), or
  - `npm run test:init-db` (Node-only: schema + seed, use when tsx fails)

## 1. Build

```bash
npm run build
```

Must complete with no TypeScript or compile errors.

## 2. Database smoke test

```bash
node scripts/test-db.mjs
```

Expect: `✓ DB connection OK`, routes/checkpoints counts (or a note to run db:setup/seed).

## 3. Start the app

**Development:**

```bash
npm run dev
```

**Production (after build):**

```bash
npm run start
# Or with standalone: node .next/standalone/server.js
```

Server runs at http://localhost:3001 (or PORT if set).

## 4. Dev bypass for API testing

For local testing without Azure AD sign-in, set this cookie:

- **Name:** `dev-bypass-auth`
- **Value:** `true`
- **Domain:** `localhost`

In Chrome DevTools: Application → Cookies → localhost → Add.

## 5. API test scripts

With the server running and dev-bypass cookie set:

**Shell (curl):**
```bash
npm run test:api
# Or: bash scripts/test-api.sh http://127.0.0.1:3001
```

**Node (fetch) – full flow:**
```bash
npm run test:api:full
# Or: node scripts/test-api-full.mjs http://127.0.0.1:3000
```

Checks: GET /, GET/POST /api/routes, GET /api/checkpoints, /api/entities, /api/photos, /api/review/summary, GET/POST /api/subsections, GET /api/photos/[id]/image (200 + image), 401 without cookie.

## 6. Manual end-to-end checklist

### Home & auth

- [ ] Open `/` → redirects to dashboard when authenticated (or dev bypass)
- [ ] Open `/signin` → Azure AD sign-in (or use dev bypass)
- [ ] Set cookie `dev-bypass-auth=true` → can access protected pages

### Dashboard

- [ ] `/dashboard` loads, links to Capture, Gallery, Review, Map, Admin, Reports

### Capture

- [ ] `/capture` loads
- [ ] Select route, subsection, entity → table shows required checkpoints/stages
- [ ] Upload/capture flow works (camera or file picker if implemented)
- [ ] Photo appears with correct status (pending/approved/rejected)

### Gallery

- [ ] `/gallery` loads
- [ ] Select route and subsection → photos list
- [ ] Filters (entity, checkpoint, category) work
- [ ] Thumbnails and links work

### Review

- [ ] `/review` loads, summary table shows route/subsection counts (approved, pending, rejected)
- [ ] Click Pending → detail view with pending/rejected photos
- [ ] Approve / Reject / Delete work
- [ ] Select all and bulk approve/reject/delete work

### Map

- [ ] `/map` loads, map renders
- [ ] Select route → photos with lat/long show as markers
- [ ] Marker popup: thumbnail and “View full size” link
- [ ] Route line (nearest-neighbor from endpoints) displays without crossing

### Admin

- [ ] `/admin` loads
- [ ] Create route (route_id + route_name)
- [ ] Create subsection (route_id, subsection_id, subsection_name)
- [ ] Entity/checkpoint codes table visible

### Reports

- [ ] `/reports` loads
- [ ] Select route (or All routes) → table with photo links
- [ ] “Download Excel (CSV)” exports CSV

### View photo

- [ ] `/view-photo/[id]` loads full-size image (geo/location/IST burned at capture)

### API (with dev bypass)

- [ ] GET /api/routes → list
- [ ] POST /api/routes → create route
- [ ] GET /api/subsections?route_id=X
- [ ] POST /api/subsections → create subsection
- [ ] GET /api/photos?routeId=&subsectionId=&limit=500
- [ ] POST /api/photos/upload (multipart: file, routeId, subsectionId, checkpointId, executionStage, …)
- [ ] GET /api/photos/[id] → photo details
- [ ] GET /api/photos/[id]/image → image bytes
- [ ] DELETE /api/photos/[id] (only if status ≠ approved)
- [ ] GET /api/review/summary → summary rows
- [ ] POST /api/approvals → approve/reject photo

## 7. S3

- New uploads use prefix `df-photos/` in the bucket (see `lib/s3.ts`).
- Confirm objects appear under `df-photos/` in the configured bucket.

## 8. npm scripts

| Script               | Purpose                              |
|----------------------|--------------------------------------|
| `npm run build`      | Production build                     |
| `npm run test`       | Same as build (type-check)           |
| `npm run test:init-db` | DB schema + seed (Node-only, no tsx) |
| `npm run test:db`    | DB smoke test                        |
| `npm run test:api`   | API test (curl) – server must be up  |
| `npm run test:api:full` | API test (fetch) – server must be up |
| `npm run db:setup`   | Create DB + schema (tsx)             |
| `npm run seed:checkpoints` | Load checkpoints (tsx)        |

**Full test flow (run locally):**
1. `npm run build`
2. `npm run test:init-db` (or `db:setup` + `seed:checkpoints`)
3. `npm run test:db`
4. `npm run dev` (in another terminal)
5. Set cookie `dev-bypass-auth=true` in browser
6. `npm run test:api:full`
7. Work through the manual checklist in §6
