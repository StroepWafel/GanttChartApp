const MAX_NAME_LEN = 500;

export function validateName(name, maxLen = MAX_NAME_LEN) {
  if (name == null || typeof name !== 'string') return { ok: false, error: 'Name is required' };
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: 'Name cannot be empty' };
  if (trimmed.length > maxLen) return { ok: false, error: `Name must be at most ${maxLen} characters` };
  return { ok: true, value: trimmed };
}

export function validateDateRange(startDate, endDate) {
  if (!startDate || !endDate) return { ok: true };
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (isNaN(start.getTime())) return { ok: false, error: 'Invalid start date' };
  if (isNaN(end.getTime())) return { ok: false, error: 'Invalid end date' };
  if (start > end) return { ok: false, error: 'Start date must be before or equal to end date' };
  return { ok: true };
}

export function validatePriority(priority) {
  if (priority == null) return { ok: true, value: 5 };
  const p = parseInt(priority, 10);
  if (isNaN(p) || p < 1 || p > 10) return { ok: false, error: 'Priority must be between 1 and 10' };
  return { ok: true, value: p };
}
