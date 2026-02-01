# Migration and deployment

Single source of truth for database setup, migrations, seed data, and server deployment.

---

## 1. First-time database setup (new install)

Use this when you have **no database** or an empty `data/` folder.

```bash
npm install
# Create .env (NEXTAUTH_*, AZURE_AD_*, AWS_*, DATABASE_PATH optional)
npm run db:setup
npm run db:seed-entities-checkpoints
```

- **db:setup** – Creates schema (tables, indexes) and applies in-code migrations (e.g. `photo_submission_comments`, `subsection_allowed_emails`). Safe to run again; it only adds what’s missing.
- **db:seed-entities-checkpoints** – Inserts entities and checkpoints from `scripts/create_entity_checkpoints.sql` (INSERT OR IGNORE). Safe to run again.

**If seed fails with “table checkpoints has no column named entity_id”** – Your DB has an old schema. Use [§3 Fix old schema (no entity_id)](#3-fix-old-schema-no-entity_id) then run the seed again.

---

## 2. Migrating an existing database (old schema)

Use this when you **already have a database** created with an older version of the app.

### 2a. Old schema with `checkpoints.entity` (text column)

If your `checkpoints` table has a column named **entity** (text), run:

```bash
npm run db:migrate
npm run db:migrate:execution-stage
npm run db:seed-entities-checkpoints
```

- **db:migrate** – Creates `entities` table, adds `entity_id` to checkpoints, migrates data from `checkpoints.entity`, creates `subsection_allowed_emails`. Skips if `entities` already exists.
- **db:migrate:execution-stage** – Adds `execution_stage` to checkpoints if missing. Idempotent.
- **db:seed-entities-checkpoints** – Ensures standard entities/checkpoints exist (INSERT OR IGNORE).

### 2b. Old schema with no `entity` and no `entity_id`

If the seed fails with **“table checkpoints has no column named entity_id”** and the migration in §2a does nothing (no `entity` column), then checkpoints was created with an incompatible old schema. Recreate entities and checkpoints, then seed:

```bash
npm run db:fix-schema
```

This will:

1. Drop `checkpoints` and `entities`.
2. Recreate them from `create-schema.sql`.
3. Run `db:seed-entities-checkpoints` automatically.

**Warning:** Existing `photo_submissions.checkpoint_id` values will become orphaned (IDs no longer exist). Those submissions may show as “unknown checkpoint” until reassigned. Data in other tables (routes, subsections, photo_submissions rows) is not dropped.

---

## 3. Fix old schema (no entity_id)

**When to use:** Seed fails with “table checkpoints has no column named entity_id” and `db:migrate` does not apply (no `checkpoints.entity` column).

```bash
npm run db:fix-schema
```

Runs `scripts/fix-entities-checkpoints-schema.mjs`: drops and recreates `entities` and `checkpoints`, then seeds. If `checkpoints` already has `entity_id`, the script exits and tells you to run `db:seed-entities-checkpoints` only.

---

## 4. Loading / refreshing seed data only

If entities and checkpoints are missing or you want to refresh from `create_entity_checkpoints.sql`:

```bash
npm run db:seed-entities-checkpoints
```

Requires current schema (checkpoints must have `entity_id`). Uses INSERT OR IGNORE, so it does not duplicate rows.

To regenerate the SQL file from JSON (for maintainers):

```bash
npm run db:generate-entity-checkpoints-sql
```

Reads `checkpoints_data.json` and overwrites `scripts/create_entity_checkpoints.sql`.

---

## 5. Server deployment

### 5.1 Ports

- **Local / default:** App listens on **3001** (or `PORT` from `.env` / ecosystem).
- **Behind Nginx:** Many setups proxy Nginx (e.g. 443, 3001) to the app on **13001**. In that case the app must listen on **13001**:
  - Set **PORT=13001** in server `.env` or in `ecosystem.config.js` `env.PORT`.
  - `package.json` uses `"start": "next start"` so the app respects `PORT`.

Do **not** run `fuser -k 3001/tcp` if Nginx listens on 3001; that will kill Nginx.

### 5.2 First-time deploy on server

1. Clone repo, install, build:
   ```bash
   git clone <repo-url> CE_DF_Photos && cd CE_DF_Photos
   npm ci && npm run build
   ```
2. Create **.env** (NEXTAUTH_*, AZURE_AD_*, AWS_*, DATABASE_PATH). Set **PORT=13001** if Nginx proxies to 13001.
3. Database and app:
   ```bash
   mkdir -p data
   npm run db:setup
   npm run db:seed-entities-checkpoints
   ```
   If seed fails with “no column named entity_id”, run `npm run db:fix-schema` then continue.
4. Start app with PM2 (use ecosystem that sets PORT if needed):
   ```bash
   pm2 start ecosystem.config.js --name ce-df-photos
   pm2 save && pm2 startup
   ```
5. Configure Nginx to proxy to the app (e.g. 443 and 3001 → `http://127.0.0.1:13001`). See `scripts/ce-df-photos.nginx.conf` for reference.

### 5.3 Subsequent deploys (code updates)

From the app directory on the server:

```bash
./scripts/deploy-and-verify-on-server.sh
```

The script:

1. `git pull` (or ensure code is up to date).
2. `npm ci && npm run build`.
3. **npm run db:setup** – ensures schema and in-code migrations are applied.
4. **npm run db:seed-entities-checkpoints** – ensures entities and checkpoints exist.
5. Restarts PM2 (`ce-df-photos`).
6. Health check on the app port (see below).

**Health check port:** The script uses **APP_PORT** (default **13001**) for the health check. If your app runs on 3001, run:

```bash
APP_PORT=3001 ./scripts/deploy-and-verify-on-server.sh
```

### 5.4 Verify

- `pm2 status` / `pm2 logs ce-df-photos`
- `./scripts/verify-server.sh https://your-domain.com`
- In browser: sign in and check Dashboard, Capture (entities/checkpoints), Gallery, Review.

---

## 6. Quick reference

| Goal | Command(s) |
|------|------------|
| New DB from scratch | `npm run db:setup` → `npm run db:seed-entities-checkpoints` |
| Old DB (has checkpoints.entity) | `npm run db:migrate` → `npm run db:migrate:execution-stage` → `npm run db:seed-entities-checkpoints` |
| Seed fails (no entity_id) | `npm run db:fix-schema` |
| Refresh seed only | `npm run db:seed-entities-checkpoints` |
| Deploy on server (updates) | `./scripts/deploy-and-verify-on-server.sh` (set APP_PORT if not 13001) |

See [scripts-reference.md](scripts-reference.md) for a list of all scripts and files.
