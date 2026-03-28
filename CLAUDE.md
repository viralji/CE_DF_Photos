# CE DF Photos — AI Tool Context

## Project
Next.js 16 photo-capture and review app for DF (Dark Fibre) infrastructure work.
Field teams submit geotagged photos; reviewers approve/reject; AI (Gemini Vision) scores each photo.

**Live URL:** https://dfphotos.cloudextel.com
**Stack:** Next.js 16 (App Router), SQLite (better-sqlite3), AWS S3, NextAuth (Azure AD), PM2, DigitalOcean

---

## Production Server

| Item | Value |
|------|-------|
| IP | `64.227.174.91` |
| User | `root` |
| SSH key | `~/.ssh/do_64.227.174.91` |
| App path | `/var/www/CE_DF_Photos` |
| PM2 app name | `ce-df-photos` |
| Port | `13001` (proxied via nginx to 443) |

**SSH:**
```bash
ssh -i ~/.ssh/do_64.227.174.91 root@64.227.174.91
```

---

## Deploy (single command from local)

```bash
./scripts/deploy.sh
```

That script pushes to git and runs the full deploy on the server.
Do **not** pass a `SERVER` arg — the defaults are correct for production.

### What deploy does (in order, non-destructive)
1. `git push` to GitHub
2. SSH to server
3. **Backup DB** → `/var/www/CE_DF_Photos/data/backups/ce_df_photos_<timestamp>.db`
4. `git pull`
5. `npm ci`
6. `npm run build` — aborts here if build fails (app keeps running on old build)
7. `npm run db:setup` + `npm run db:seed-entities-checkpoints` (idempotent)
8. `pm2 restart ce-df-photos`
9. Health check `GET /` → must return 200/307

**The live app stays running until step 8.** If the build fails (step 6), the deploy aborts and the running app is untouched.

---

## Rollback

If a deploy breaks the app:

```bash
./scripts/rollback.sh
```

This will:
1. SSH to server
2. `git reset --hard HEAD~1` (or pass a commit SHA: `./scripts/rollback.sh <sha>`)
3. Rebuild and restart
4. If DB is corrupted: restore most recent backup automatically

To manually restore DB backup only (no code rollback):
```bash
ssh -i ~/.ssh/do_64.227.174.91 root@64.227.174.91 \
  "ls -lt /var/www/CE_DF_Photos/data/backups/"
# then pick the backup and:
ssh -i ~/.ssh/do_64.227.174.91 root@64.227.174.91 \
  "cp /var/www/CE_DF_Photos/data/backups/<chosen>.db /var/www/CE_DF_Photos/data/ce_df_photos.db && pm2 restart ce-df-photos"
```

---

## Key Scripts

| Script | Purpose |
|--------|---------|
| `./scripts/deploy.sh` | Full deploy from local (push + SSH deploy) |
| `./scripts/rollback.sh [sha]` | Rollback to previous commit on server |
| `npx tsx scripts/score-all-photos.ts` | Score all unscored/errored photos via Gemini |
| `npx tsx scripts/rescore-photos.ts <id>…` | Re-score specific photo IDs |
| `npm run db:setup` | Create schema + run migrations (idempotent) |
| `npm run db:seed-entities-checkpoints` | Load entities/checkpoints from checkpoints_data.json |

> **Running scripts on server:** always `source .env` first (env vars needed for S3/Gemini):
> ```bash
> ssh -i ~/.ssh/do_64.227.174.91 root@64.227.174.91
> cd /var/www/CE_DF_Photos
> set -a && source .env && set +a
> npx tsx scripts/score-all-photos.ts
> ```

---

## Useful Server Commands

```bash
# Check app status
pm2 status

# Live logs
pm2 logs ce-df-photos --lines 50

# Check what's running / port
ss -tlnp | grep 13001

# List DB backups
ls -lht /var/www/CE_DF_Photos/data/backups/

# Check disk space
df -h /var/www
```

---

## Environment Variables (.env)

Never commit `.env`. Key vars (all required in production):

| Var | Purpose |
|-----|---------|
| `DATABASE_PATH` | Absolute path to SQLite DB |
| `NEXTAUTH_URL` | `https://dfphotos.cloudextel.com` in prod |
| `NEXTAUTH_SECRET` | Random secret for NextAuth JWT |
| `AZURE_AD_CLIENT_ID` / `_SECRET` / `_TENANT_ID` | Azure AD SSO |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_REGION` / `AWS_S3_BUCKET_NAME` | S3 photo storage |
| `GEMINI_API_KEY` | AI photo scoring |
| `ERPNEXT_URL` / `ERPNEXT_API_KEY` / `ERPNEXT_API_SECRET` | ERP sync |

---

## Project Layout

```
app/                  Next.js App Router pages + API routes
  api/photos/         Photo CRUD, upload, AI score endpoints
  review/             Review page (approve/reject photos)
  capture/            Field capture page
  admin/              Admin panel (AI config, settings)
lib/
  db.ts               SQLite connection + migrations
  s3.ts               AWS S3 upload/download helpers
  ai-scoring.ts       Gemini Vision scoring pipeline
  auth-helpers.ts     NextAuth session + role helpers
scripts/
  deploy.sh           One-command deploy from local
  rollback.sh         Rollback last deploy on server
  deploy-and-verify-on-server.sh   Full server-side deploy steps
  score-all-photos.ts Bulk AI scoring
  setup-db.ts         Schema + migrations runner
data/
  ce_df_photos.db     SQLite DB (not in git)
  backups/            Auto-backups created on each deploy
checkpoints_data.json Entity/checkpoint definitions (seeded to DB)
ecosystem.config.js   PM2 config
```

---

## Common Gotchas

- **`&` in subsection names** — always use `encodeURIComponent()` when building API query strings with `routeId`/`subsectionId`.
- **Scripts and env vars** — use `await import(...)` (dynamic) not `import` (static) in standalone scripts so `.env` loads before module init.
- **DB is SQLite** — single writer, single PM2 instance. Do not scale to multiple Node processes.
- **Build takes ~25s** — the old build keeps serving during the build step; downtime only during `pm2 restart` (~2s).
