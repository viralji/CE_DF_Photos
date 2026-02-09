# CE DF Photos

Photo capture and review system for fiber optic installation quality control. Mobile-first PWA: capture photos per spec with geo-tagging, store on AWS S3, review on the web.

**Stack:** Next.js 16, SQLite, NextAuth (Azure AD), AWS S3, IndexedDB (offline).

---

## Features

| Area | Feature |
|------|--------|
| **Capture** | Geo-tagged photos (high-accuracy GPS). **Session = until logout**: first photo after login allowed; then **40 m rule** applies (photo only if ≤ 40 m from last capture; Admin can disable in Settings). **GPS during capture**: shows ±X m accuracy and distance from last photo (throttled updates). **Max GPS accuracy** (Admin): block capture if accuracy worse than ±X m (e.g. ±20 m). Multiple photos per checkpoint (blue "+"); offline with IndexedDB; duplicate detection. Geo + CloudExtel logo **burned on every photo** (uploads and resubmissions). |
| **Gallery** | Browse photos by route/subsection; view full-size with metadata. |
| **View photo** | Single photo view with comments, status, and actions (retake/resubmit when QC Required or NC). |
| **Review** | Approve / QC Required / NC with **comment thread**; QC Required and NC require a comment; capturer resubmits with comment. **Full resubmission history**: "View full history" timeline of all attempts (image, comments, status, timestamp). Mobile: compact icon-only buttons. Bulk actions with shared comment. |
| **Map** | Route, subsection, and entity filters; photo locations on map. |
| **Reports** | Route completion and related reports. |
| **Admin** | User and role management; subsection access. **Settings**: "Enforce 40 m capture distance" (toggle); **Max GPS accuracy (m)** — block capture if accuracy worse than ±X m (e.g. 20); leave empty for no limit. |
| **Questions and Suggestions** | Dashboard: questions (AI via Google Gemini) or suggestions; stored in `user_feedback`. Requires `GEMINI_API_KEY` in `.env`. |
| **Auth** | NextAuth with Azure AD; for local testing set cookie **dev-bypass-auth** = **true**. **Logout** clears capture session (next login = first photo allowed). |

---

## Quick start

```bash
npm install
# Create .env: NEXTAUTH_*, AZURE_AD_*, AWS_*, DATABASE_PATH. For Questions: GEMINI_API_KEY.
npm run db:setup
npm run db:seed-entities-checkpoints
npm run dev
```

Open **http://localhost:3001**. For local testing without Azure AD, set cookie **dev-bypass-auth** = **true** (DevTools → Application → Cookies). Use `NEXTAUTH_URL=http://localhost:3001` in `.env` when using port 3001.

**Stable dev:** The dev script uses **webpack** (not Turbopack) to reduce hang on refresh. For Turbopack use `npm run dev:turbo`.

**Port in use:** If "address already in use :::3001", run **`npm run dev:fresh`** to free the port and start, or manually kill the process on 3001 then `npm run dev`.

**Remote / server:** If the app runs on a remote machine, use the URL printed at start (e.g. `http://10.x.x.x:3001`) in your browser, not localhost.

---

## Database and migrations

**New install (no DB yet):**

```bash
npm run db:setup
npm run db:seed-entities-checkpoints
```

- **db:setup** — Creates schema from `scripts/create-schema.sql` (if new DB) and applies in-code migrations in `lib/db.ts`: `photo_submission_comments`, `subsection_allowed_emails`, `user_feedback`, `resubmission_of_id`, `app_settings`, **routes.length**, **subsections.length** (ERP sync), file fingerprint columns, etc. Idempotent.
- **db:seed-entities-checkpoints** — Inserts entities and checkpoints from `checkpoints_data.json`. Idempotent.

| Goal | Command(s) |
|------|------------|
| New DB | `npm run db:setup` → `npm run db:seed-entities-checkpoints` |
| Refresh seed | `npm run db:seed-entities-checkpoints` |
| Deploy (updates) | `./scripts/deploy-and-verify-on-server.sh` (runs db:setup + seed; set APP_PORT if not 13001) |

---

## Scripts reference

| Script | Purpose |
|--------|---------|
| **db:setup** | Schema (create-schema.sql) + in-code migrations (lib/db.ts). Safe to re-run. |
| **db:seed-entities-checkpoints** | Seed entities/checkpoints from checkpoints_data.json (run after editing that file). |
| **deploy-and-verify-on-server.sh** | On server: git pull, npm ci, build, db:setup, seed, PM2 restart, health check. |
| **deploy-from-local.sh** | From local: git push, then SSH to server and run deploy-and-verify-on-server.sh. Set `SERVER=root@host`. |
| **verify-server.sh** | Quick health check: `./scripts/verify-server.sh https://your-domain.com` |

---

## Review workflow (summary)

1. **Capturer submits photo** → Status **Pending**.
2. **Reviewer** (Review page): **Approve** (optional comment) or **QC Required** / **NC** (comment required).
3. **If QC Required or NC:** Capturer sees feedback; **Retake** → comment modal → **Continue to camera** → take photo → resubmit (new image + comment; geo and logo burned). Status → **Pending**. Full history viewable via "View full history" (timeline of all attempts).
4. Repeat until **Approved**.

**Bulk:** Approve or QC Required/NC with one shared comment for multiple photos.

---

## Deployment

**First time on server (e.g. Digital Ocean):**

1. Clone, install, build: `git clone <repo> CE_DF_Photos && cd CE_DF_Photos && npm ci && npm run build`
2. Create **.env** (NEXTAUTH_*, AZURE_AD_*, AWS_*, DATABASE_PATH). Set **PORT=13001** if Nginx proxies to 13001.
3. DB and app: `mkdir -p data && npm run db:setup && npm run db:seed-entities-checkpoints` (db:setup applies `scripts/create-schema.sql` and all in-code migrations in `lib/db.ts`, including routes/subsections length). Subsections use unique key `(route_id, subsection_id)`; ERP report should include a **subsection_id** column for correct sync.
4. Start: `pm2 start ecosystem.config.js --name ce-df-photos` then `pm2 save && pm2 startup`
5. Configure Nginx to proxy to the app (e.g. 443 → `http://127.0.0.1:13001`). See `scripts/ce-df-photos.nginx.conf`.

**Subsequent deploys:** Either (a) **on the server:** `cd /path/to/CE_DF_Photos && ./scripts/deploy-and-verify-on-server.sh`, or (b) **from your local machine:** push code, then run `SERVER=root@your-droplet-ip ./scripts/deploy-from-local.sh` (set `APP_PATH` if the app is not in `~/CE_DF_Photos` on the server). Uses APP_PORT=13001 for health check; set `APP_PORT=3001` if the app listens on 3001.

**Refresh seed on server:** After updating `checkpoints_data.json`, push code. On the server: `cd /path/to/CE_DF_Photos && git pull && npm run db:seed-entities-checkpoints && pm2 restart ce-df-photos`.

**Verify:** `pm2 status` / `pm2 logs ce-df-photos`; `./scripts/verify-server.sh https://your-domain.com`; sign in and check Dashboard, Capture, Gallery, Review.

**Deployment checklist:** The deploy script runs: git pull → npm ci → build → db:setup → db:seed-entities-checkpoints → PM2 restart → health check on APP_PORT (default 13001).

---

## Docs

- **`docs/scaling-and-concurrency.md`** — Concurrency for ~30–40 users (DB, PM2, Nginx, checklist).
- **`docs/review-workflow-flowchart.png`** — Review workflow diagram.
