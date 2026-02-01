# Scripts reference

Which scripts in `scripts/` do what, and in what order. For full migration and deployment steps see [migration-and-deployment.md](migration-and-deployment.md).

---

## Order of operations

| When | Commands |
|------|----------|
| **New DB (first time)** | `npm run db:setup` → `npm run db:seed-entities-checkpoints` |
| **Old DB (has checkpoints.entity)** | `npm run db:migrate` → `npm run db:migrate:execution-stage` → `npm run db:seed-entities-checkpoints` |
| **Seed fails (no entity_id)** | `npm run db:fix-schema` (then seed runs automatically) |
| **Refresh seed only** | `npm run db:seed-entities-checkpoints` |
| **Deploy on server** | `./scripts/deploy-and-verify-on-server.sh` (runs db:setup + seed; uses APP_PORT=13001 for health check) |

---

## Required for app and npm scripts

| File | Used by | Purpose |
|------|---------|---------|
| **create-schema.sql** | `lib/db.ts`, `init-db-full.mjs` | DB schema (tables, indexes). Loaded on first `getDb()` or by init-db-full. |
| **create_entity_checkpoints.sql** | `run-create-entity-checkpoints.mjs` | Seed data: entities + checkpoints. Run via `npm run db:seed-entities-checkpoints`. |
| **setup-db.ts** | `npm run db:setup` | Calls `getDb()` so lib/db runs schema + in-code migrations. |
| **run-create-entity-checkpoints.mjs** | `npm run db:seed-entities-checkpoints` | Runs create_entity_checkpoints.sql to seed entities/checkpoints. |
| **generate-entity-checkpoints-sql.mjs** | `npm run db:generate-entity-checkpoints-sql` | Regenerates create_entity_checkpoints.sql from checkpoints_data.json. |
| **init-db-full.mjs** | `npm run test:init-db` | Schema + seed from JSON (Node-only, no tsx). Same idea as db:setup + seed. |
| **test-db.mjs** | `npm run test:db` | DB smoke test (connection, routes, checkpoints). |
| **test-api-full.mjs** | `npm run test:api:full` | Full API test (routes, photos, approvals, comments, resubmit). Server must be running. |
| **test-api.sh** | `npm run test:api` | Quick API smoke test (curl). Server must be running. |

---

## One-time migrations (existing DBs)

| File | Used by | Purpose |
|------|---------|---------|
| **migrate-entities-and-subsection-emails.mjs** | `npm run db:migrate` | Migrate old schema (checkpoints.entity text) to entities + entity_id + subsection_allowed_emails. Skips if entities table exists. |
| **migrate-execution-stage.mjs** | `npm run db:migrate:execution-stage` | Add execution_stage to checkpoints if missing. Idempotent. |
| **fix-entities-checkpoints-schema.mjs** | `npm run db:fix-schema` | If checkpoints has no entity_id: drop checkpoints + entities, recreate from schema, then run seed. Use when seed fails with “no column named entity_id” and db:migrate does not apply. |

---

## Optional / ops

| File | Purpose |
|------|---------|
| **deploy-and-verify-on-server.sh** | Deploy on server: git pull, npm ci, build, db:setup, db:seed-entities-checkpoints, PM2 restart, health check (APP_PORT=13001). See [migration-and-deployment.md](migration-and-deployment.md). |
| **verify-server.sh** | Quick health check (curl) against a URL. |
| **ce-df-photos.nginx.conf** | Nginx config reference for reverse proxy. |

---

**Quick start:** `npm run db:setup` then `npm run db:seed-entities-checkpoints`.  
**Full flow:** [migration-and-deployment.md](migration-and-deployment.md).
