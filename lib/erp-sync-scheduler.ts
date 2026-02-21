import { getDb } from '@/lib/db';
import { runErpNextSync, writeErpSyncLastRun } from '@/app/api/sync-erpnext/route';

const TICK_MS = 60_000; // 1 minute

let started = false;
let running = false;

function tick(): void {
  if (running) return;
  try {
    const db = getDb();
    const intervalRow = db.prepare("SELECT value FROM app_settings WHERE key = 'erp_sync_interval_minutes'").get() as { value: string } | undefined;
    const intervalMinutes = intervalRow?.value != null && intervalRow.value !== '' ? parseInt(intervalRow.value, 10) : 0;
    if (intervalMinutes <= 0 || !Number.isFinite(intervalMinutes)) return;

    const lastRunRow = db.prepare("SELECT value FROM app_settings WHERE key = 'erp_sync_last_run_at'").get() as { value: string } | undefined;
    const lastRunAt = lastRunRow?.value ? new Date(lastRunRow.value).getTime() : 0;
    const now = Date.now();
    const nextRunAt = lastRunAt + intervalMinutes * 60 * 1000;
    if (lastRunAt > 0 && now < nextRunAt) return;

    running = true;
    runErpNextSync()
      .then((result) => {
        writeErpSyncLastRun(result.message);
      })
      .catch(() => {
        // writeErpSyncLastRun already called from POST catch; scheduler run has no request context
        // so runErpNextSync might throw without writing - write a generic message
        writeErpSyncLastRun('Scheduled sync failed (see server logs).');
      })
      .finally(() => {
        running = false;
      });
  } catch {
    running = false;
  }
}

export function startErpSyncScheduler(): void {
  if (started) return;
  started = true;
  setInterval(tick, TICK_MS);
}
