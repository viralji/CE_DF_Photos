export function to3CharCode(name: string): string {
  const cleaned = (name || '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .slice(0, 3);
  if (cleaned.length < 3) {
    return (cleaned + 'XXX').slice(0, 3);
  }
  return cleaned;
}

/** Returns 3-character unique codes per checkpoint id. */
export function uniqueCheckpointCodes(
  checkpoints: { id: number; checkpoint_name: string }[]
): Map<number, string> {
  const map = new Map<number, string>();
  const used = new Set<string>();
  for (const c of checkpoints) {
    const base = to3CharCode(c.checkpoint_name);
    let code = base;
    let n = 1;
    while (used.has(code)) {
      code = (base.slice(0, 2) + String(n)).padEnd(3, '0').slice(0, 3);
      n++;
    }
    used.add(code);
    map.set(c.id, code);
  }
  return map;
}

/** Returns 3-character unique codes per entity name. */
export function uniqueEntityCodes(entities: { entity: string }[]): Map<string, string> {
  const map = new Map<string, string>();
  const used = new Set<string>();
  const seen = new Set<string>();
  for (const e of entities) {
    const name = (e.entity || '').trim() || 'Other';
    if (seen.has(name)) continue;
    seen.add(name);
    const base = to3CharCode(name);
    let code = base;
    let n = 1;
    while (used.has(code)) {
      code = (base.slice(0, 2) + String(n)).slice(0, 3);
      n++;
    }
    used.add(code);
    map.set(name, code);
  }
  return map;
}
