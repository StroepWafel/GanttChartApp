/** Clamp and round task progress to 0–100 for API responses. */
export function normalizeProgress(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}

/** Split parents store progress 0; roll up average progress from incomplete subtasks. */
export function applyChildProgressRollup(tasks, db) {
  if (!tasks?.length) return tasks;
  const ids = tasks.map((t) => t.id).filter((id) => id != null);
  if (ids.length === 0) return tasks;
  const placeholders = ids.map(() => '?').join(', ');
  const rows = db.prepare(`
    SELECT parent_id, progress FROM tasks
    WHERE parent_id IN (${placeholders}) AND completed = 0
  `).all(...ids);
  if (rows.length === 0) return tasks;
  const byParent = new Map();
  for (const r of rows) {
    if (!byParent.has(r.parent_id)) byParent.set(r.parent_id, []);
    byParent.get(r.parent_id).push(normalizeProgress(r.progress));
  }
  return tasks.map((t) => {
    const childProgress = byParent.get(t.id);
    if (!childProgress?.length) return t;
    const avg = Math.round(childProgress.reduce((a, b) => a + b, 0) / childProgress.length);
    return { ...t, progress: avg };
  });
}
