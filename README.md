# CE DF Photos

Photo capture and review system for fiber optic installation quality control. Mobile-first PWA: capture photos per Excel spec with geo-tagging, store on AWS S3, review and approve on the web.

**Stack:** Next.js 16, SQLite, NextAuth (Azure AD), AWS S3, IndexedDB (offline).

**Features:** Geo-tagged capture (high-accuracy GPS, watchPosition); geo + location + IST timestamp burned into image at upload; gallery and view-photo; review/approve; map with markers and route line (nearest-neighbor from endpoints); reports; admin. Auth: Next.js proxy (not middleware), dev-bypass cookie for local testing.

## Quick start

```bash
npm install
# Create .env with your values (see .env or env.example)
npm run db:setup
npm run seed:checkpoints
npm run dev
```

Open **http://localhost:3001**. For local testing without Azure AD, set cookie **dev-bypass-auth** = **true** (DevTools → Application → Cookies). Ensure `NEXTAUTH_URL=http://localhost:3001` in `.env` when using port 3001.

- **Testing:** [TESTING.md](./TESTING.md) — build, DB smoke test, API scripts, manual E2E checklist.
- **Deploy:** [DEPLOY.md](./DEPLOY.md) — Digital Ocean (PM2, Nginx, HTTPS).
- **Push:** Remote `origin` → `https://github.com/viralji/CE_DF_Photos.git`; then `git push -u origin main`.
