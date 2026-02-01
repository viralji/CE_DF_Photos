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

**DB and deployment:** See [docs/migration-and-deployment.md](docs/migration-and-deployment.md) for database setup, migrations, seed data, and server deployment. See [docs/scripts-reference.md](docs/scripts-reference.md) for all scripts.

## Quick start

```bash
npm install
# Create .env with your values (see .env or env.example)
npm run db:setup
npm run db:seed-entities-checkpoints
npm run dev
```

Open **http://localhost:3001**. For local testing without Azure AD, set cookie **dev-bypass-auth** = **true** (DevTools → Application → Cookies). Ensure `NEXTAUTH_URL=http://localhost:3001` in `.env` when using port 3001.

If entities/checkpoints are missing or seed fails, see [Migration and deployment](docs/migration-and-deployment.md) (first-time setup, old DB migrations, `db:fix-schema`).

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

## Deployment

**Full instructions:** [docs/migration-and-deployment.md](docs/migration-and-deployment.md) — first-time server setup, PORT (3001 vs 13001 behind Nginx), DB setup/seed, deploy script, Nginx, and troubleshooting.

**Short:** First time: clone → `npm ci && npm run build` → `.env` (NEXTAUTH_*, AZURE_AD_*, AWS_*, DATABASE_PATH, **PORT=13001** if Nginx proxies to 13001) → `mkdir -p data && npm run db:setup && npm run db:seed-entities-checkpoints` → `pm2 start ecosystem.config.js --name ce-df-photos` → `pm2 save && pm2 startup`. Subsequent deploys: `./scripts/deploy-and-verify-on-server.sh` (uses APP_PORT=13001 for health check; set APP_PORT=3001 if your app listens on 3001).
