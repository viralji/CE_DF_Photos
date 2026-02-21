/**
 * Aging helpers: days since submission for non-approved items (pending, qc_required, nc).
 * Used on Review and Capture to show how long photos have been waiting.
 */

export function getAgingDays(createdAt: string | null | undefined): number {
  if (!createdAt) return 0;
  const created = new Date(createdAt).getTime();
  const now = Date.now();
  const days = Math.floor((now - created) / 86400000);
  return Math.max(0, days);
}

export function formatAging(days: number): string {
  if (days === 0) return '0d';
  if (days < 7) return `${days}d`;
  if (days < 14) return '1w';
  if (days < 21) return '2w';
  return '2w+';
}

/** Tailwind classes for aging badge by days: <3 slate, 3-7 amber, >7 red */
export function getAgingBadgeClass(days: number): string {
  if (days < 3) return 'bg-slate-200 text-slate-700';
  if (days <= 7) return 'bg-amber-100 text-amber-800';
  return 'bg-red-100 text-red-800';
}
