# Scripts reference

Which scripts in `scripts/` are needed and what they do.

## Required for app and npm scripts

| File | Used by | Purpose |
|------|---------|---------|
| **create-schema.sql** | `lib/db.ts`, `init-db-full.mjs` | DB schema (tables, indexes). Loaded on first `getDb()` or by init-db-full. |
| **create_entity_checkpoints.sql** | `run-create-entity-checkpoints.mjs` | Seed data: entities + checkpoints. Run via `npm run db:seed-entities-checkpoints`. |
| **setup-db.ts** | `npm run db:setup` | Calls `getDb()` so lib/db runs migrations (schema, photo_submission_comments, etc.). |
| **run-create-entity-checkpoints.mjs** | `npm run db:seed-entities-checkpoints` | Runs create_entity_checkpoints.sql to seed entities/checkpoints. |
| **generate-entity-checkpoints-sql.mjs** | `npm run db:generate-entity-checkpoints-sql` | Regenerates create_entity_checkpoints.sql from checkpoints_data.json. |
| **init-db-full.mjs** | `npm run test:init-db` | Schema + seed from JSON (Node-only, no tsx). Same idea as db:setup + seed. |
| **test-db.mjs** | `npm run test:db` | DB smoke test (connection, routes, checkpoints). |
| **test-api-full.mjs** | `npm run test:api:full` | Full API test (routes, photos, approvals, comments, resubmit). Server must be running. |
| **test-api.sh** | `npm run test:api` | Quick API smoke test (curl). Server must be running. |

## One-time migrations (existing DBs)

| File | Used by | Purpose |
|------|---------|---------|
| **migrate-entities-and-subsection-emails.mjs** | `npm run db:migrate` | Migrate old schema (e.g. checkpoints.entity text) to entities + subsection_allowed_emails. |
| **migrate-execution-stage.mjs** | `npm run db:migrate:execution-stage` | Add execution_stage to checkpoints. |

## Optional / ops

| File | Purpose |
|------|---------|
| **deploy-and-verify-on-server.sh** | Deploy on server and run test-api-full. |
| **verify-server.sh** | Quick health check (curl) against a URL. |
| **ce-df-photos.nginx.conf** | Nginx config reference for reverse proxy. |

---

**Quick start:** `npm run db:setup` then `npm run db:seed-entities-checkpoints`.
