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
