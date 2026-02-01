# CE DF Photos

Photo capture and review system for fiber optic installation quality control. Mobile-first PWA: capture photos per spec with geo-tagging, store on AWS S3, review on the web.

**Stack:** Next.js 16, SQLite, NextAuth (Azure AD), AWS S3, IndexedDB (offline).

---

## Features (overview)

| Area | Feature |
|------|--------|
| **Capture** | Geo-tagged photos (high-accuracy GPS); **multiple photos per checkpoint** (blue "+" for extra slots); offline support with IndexedDB; duplicate photo detection (blocks re-upload of same file). |
| **Gallery** | Browse photos by route/subsection; view full-size with metadata. |
| **View photo** | Single photo view with comments, status, and actions (retake/resubmit when QC Required or NC). |
| **Review** | Approve / QC Required / NC with **comment thread**; QC Required and NC require a comment; capturer can resubmit with comment; bulk actions with shared comment. See [Review workflow](docs/review-workflow-flowchart.md). |
| **Map** | Route, subsection, and entity filters; photo locations on map. |
| **Reports** | Route completion and related reports. |
| **Admin** | User and role management (Engineer, Reviewer, Admin); subsection access. |
| **Auth** | NextAuth with Azure AD; for local testing use cookie **dev-bypass-auth** = **true**. |

**Scripts and DB:** See [docs/scripts-reference.md](docs/scripts-reference.md) for required vs optional scripts and migrations.

## Quick start

```bash
npm install
# Create .env with your values (see .env or env.example)
npm run db:setup
npm run db:seed-entities-checkpoints
npm run dev
```

Open **http://localhost:3001**. For local testing without Azure AD, set cookie **dev-bypass-auth** = **true** (DevTools → Application → Cookies). Ensure `NEXTAUTH_URL=http://localhost:3001` in `.env` when using port 3001.

### Restoring entities and checkpoints

If routes/entities/checkpoints are missing after a migration or fresh DB:

1. `npm run db:migrate` (if you had the old schema with `checkpoints.entity` text column)
2. `npm run db:migrate:execution-stage` (adds `execution_stage` to checkpoints)
3. `npm run db:seed-entities-checkpoints` (runs `scripts/create_entity_checkpoints.sql` to seed entities/checkpoints)

To regenerate the SQL from JSON: `npm run db:generate-entity-checkpoints-sql` (reads `checkpoints_data.json`).

**Scripts folder:** See [docs/scripts-reference.md](docs/scripts-reference.md) for which scripts are required vs optional.

---

## Testing

- **Build:** `npm run build`
- **DB smoke test:** `npm run test:db` (or `node scripts/test-db.mjs`) — expects `✓ DB connection OK`
- **DB init (Node-only):** `npm run test:init-db` (schema + seed; use when tsx fails)
- **API tests (server must be running):**  
  - Shell: `npm run test:api` or `bash scripts/test-api.sh http://127.0.0.1:3001`  
  - Full flow: `npm run test:api:full` or `node scripts/test-api-full.mjs http://127.0.0.1:3001`

For API tests without Azure AD, set cookie **dev-bypass-auth** = **true** on localhost.

**Scripts:** `test` = build; `test:db` = DB smoke; `test:init-db` = init DB (Node); `test:api` = curl; `test:api:full` = full API flow (routes, photos, approvals, comments, resubmit).

---

## Deployment (Digital Ocean)

- **Prerequisites:** Ubuntu 22.04, Node.js 20+, PM2, optional Nginx + Certbot.
- **Deploy:** Clone repo → `npm ci && npm run build` → create `.env` (NEXTAUTH_*, AZURE_AD_*, AWS_*, DATABASE_PATH) → `mkdir -p data && npm run db:setup && npm run db:seed-entities-checkpoints` → `pm2 start ecosystem.config.js` → `pm2 save && pm2 startup`.
- **Nginx:** Reverse proxy to `http://127.0.0.1:3001`; set `NEXTAUTH_URL` to your domain; `certbot --nginx -d your-domain.com`.
- **Verify:** `pm2 status` / `pm2 logs ce-df-photos`; `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3001/` (200 or 307); optional `./scripts/verify-server.sh https://your-domain.com` or `node scripts/test-api-full.mjs https://your-domain.com`.

**Troubleshooting:** App crashes → `pm2 logs`; port in use → change PORT in `.env`/ecosystem; DB errors → ensure `data/` writable, re-run `db:setup`; auth loop → `NEXTAUTH_URL` must match URL (no trailing slash); 502 → app not on 3001, reload Nginx after fixing app.

**Push:** Remote `origin` → your git URL; then `git push -u origin main`.
