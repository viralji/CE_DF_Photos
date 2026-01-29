# CE DF Photos

Photo capture and review system for fiber optic installation quality control. Mobile-first PWA: capture photos per Excel spec with geo-tagging, store on AWS S3, review and approve on the web.

**Stack:** Next.js 16, SQLite, NextAuth (Azure AD), AWS S3, IndexedDB (offline).

## Quick start

```bash
npm install
# Create .env with your values (see .env or env.example)
npm run db:setup
npm run seed:checkpoints
npm run dev
```

Open http://localhost:3000. For local testing without Azure AD, set cookie **dev-bypass-auth** = **true** (DevTools → Application → Cookies).

**Testing:** See [TESTING.md](./TESTING.md) for build, DB smoke test, API test script, and manual E2E checklist.

**Deploy:** See [DEPLOY.md](./DEPLOY.md) for Digital Ocean (PM2, Nginx, HTTPS).

**Push to your Git:** Remote `origin` is set to `https://github.com/viralji/CE_DF_Photos.git`. Create that repo on GitHub (empty, no README), then run: `git push -u origin main`.
