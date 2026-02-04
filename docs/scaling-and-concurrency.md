# Scaling and Concurrency (30–40 Users)

The app is designed to support **~30–40 concurrent users** (e.g. 20 in the field on mobile, 10 on laptop) and remain stable under that load.

## Architecture choices

- **Single Node process (PM2 `instances: 1`)**  
  The app uses SQLite (better-sqlite3) with one database file. Running a single process avoids multiple processes competing for the same DB and keeps behavior predictable. One process is sufficient for this user count.

- **SQLite in WAL mode**  
  Write-Ahead Logging allows many concurrent **reads** while **writes** are serialized. Most traffic is reads (dashboard, capture list, review list); writes (photo upload, approve, comment) are less frequent. A 15s `busy_timeout` lets the DB wait for locks instead of failing under brief write contention.

- **Stateless API**  
  NextAuth uses JWT sessions by default (no server-side session store), so no per-user state on the server. React Query `staleTime` reduces repeat API calls from the same client.

## What’s in place

| Area | Setting | Purpose |
|------|--------|--------|
| **DB** | WAL, `busy_timeout = 15000`, `cache_size = -64000` | Concurrent reads; write waits; in-memory cache |
| **Upload / Resubmit** | `maxDuration = 60` | Allow up to 60s for upload + compression + S3 |
| **Next.js** | `serverActions.bodySizeLimit: '10mb'` | Allow 10MB request bodies (photo uploads) |
| **Nginx** | `proxy_connect_timeout 10s`, `proxy_send_timeout 60s`, `proxy_read_timeout 60s` | Avoid hanging connections |
| **PM2** | `instances: 1`, `max_memory_restart: '1G'` | One process for SQLite; restart if memory grows |

## Recommendations

1. **Keep PM2 at 1 instance**  
   Do not scale to multiple Node instances with the current SQLite setup; that would increase lock contention.

2. **Monitor disk**  
   WAL and checkpointing need free disk space. Ensure the server has enough space for the DB and WAL files.

3. **Photo uploads**  
   Uploads are limited to 10MB per photo and are processed sequentially per request (compress → S3 → DB). Under heavy concurrent uploads, some requests may take longer; timeouts (Nginx 60s, route `maxDuration` 60s) avoid indefinite hangs.

4. **If you outgrow 30–40 users**  
   Consider moving to PostgreSQL (or another multi-writer DB) and then running multiple Node instances behind a load balancer. That would require code and deployment changes.

## Quick checklist for production

- [ ] PM2: `instances: 1`
- [ ] Nginx: proxy timeouts applied (see `scripts/ce-df-photos.nginx.conf`)
- [ ] Disk space for DB + WAL
- [ ] HTTPS (e.g. Nginx TLS) for all access
