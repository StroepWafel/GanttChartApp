/**
 * Compute urgency score for a task. Higher = more urgent.
 * Incomplete tasks with due dates get a boost as the due date approaches.
 */
export function computeUrgency(task) {
  const base = task.base_priority ?? 5;
  if (task.completed) return 0;
  if (!task.due_date) return base;

  const due = new Date(task.due_date);
  const now = new Date();
  const daysLeft = Math.ceil((due - now) / (1000 * 60 * 60 * 24));

  if (daysLeft <= 0) {
    return base + 15; // Overdue gets max boost
  }
  // Boost decreases as due date gets further: 10 / (days + 1)
  const boost = 10 / (daysLeft + 1);
  return base + boost;
}

/** True if task is least important (priority 0 or 1) for most-important-task ordering. */
export function isLeastImportant(task) {
  const p = task.base_priority ?? 5;
  return p === 0 || p === 1;
}

/** Effective date for ordering: due_date if given, else end_date. */
export function effectiveDate(task) {
  return task.due_date ?? task.end_date ?? null;
}

/** Compare tasks for most-important ordering: effective date ASC (soonest first; nulls last), then base_priority DESC. Date always wins: e.g. priority-1 with end_date next week comes before priority-8 due in June. */
export function compareByDateThenPriority(a, b) {
  const aDate = effectiveDate(a);
  const bDate = effectiveDate(b);
  const aVal = aDate ? new Date(aDate).getTime() : Infinity;
  const bVal = bDate ? new Date(bDate).getTime() : Infinity;
  if (aVal !== bVal) return aVal - bVal;
  return (Number(b.base_priority) || 5) - (Number(a.base_priority) || 5);
}
