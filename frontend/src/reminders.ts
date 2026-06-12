/**
 * Due date reminders via @capacitor/local-notifications.
 * Only active on mobile native (Capacitor).
 *
 * Supports multiple reminders per task, each with a configurable {amount, unit} offset
 * before the due date. Backward-compatible with the legacy single-string format ('1d', 'day', '1h').
 */

const STORAGE_PREFIX = 'gantt_reminder_';

export type ReminderUnit = 'minute' | 'hour' | 'day' | 'week';

export interface Reminder {
  /** Amount before the due date. For unit='day' with amount=0, fires at 9am on the due date. */
  amount: number;
  unit: ReminderUnit;
}

/** Legacy: single-offset string used by older clients. Still accepted on read. */
export type ReminderOffset = 'off' | '1d' | 'day' | '1h';

/** Cap to avoid overwhelming the OS notification scheduler. */
const MAX_REMINDERS_PER_TASK = 5;

export function isMobileNative(): boolean {
  return typeof (window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform === 'function' &&
    !!(window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();
}

function isNative(): boolean {
  return isMobileNative();
}

function legacyToReminder(v: string): Reminder | null {
  if (v === '1d') return { amount: 1, unit: 'day' };
  if (v === 'day') return { amount: 0, unit: 'day' };
  if (v === '1h') return { amount: 1, unit: 'hour' };
  return null;
}

/** Read reminders for a task from local storage. Returns [] for off / no reminder. */
export function getStoredReminders(taskId: number): Reminder[] {
  if (!isNative()) return [];
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + taskId);
    if (!raw) return [];
    if (raw === 'off') return [];
    if (raw.startsWith('[')) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        return arr
          .map((r) => normalizeReminder(r))
          .filter((r): r is Reminder => r !== null);
      }
      return [];
    }
    const legacy = legacyToReminder(raw);
    return legacy ? [legacy] : [];
  } catch {}
  return [];
}

/** Legacy compatibility: returns the first reminder as the old string-style enum. */
export function getStoredReminder(taskId: number): ReminderOffset {
  const list = getStoredReminders(taskId);
  if (list.length === 0) return 'off';
  const r = list[0];
  if (r.unit === 'day' && r.amount === 1) return '1d';
  if (r.unit === 'day' && r.amount === 0) return 'day';
  if (r.unit === 'hour' && r.amount === 1) return '1h';
  return '1d';
}

function normalizeReminder(r: unknown): Reminder | null {
  if (!r || typeof r !== 'object') return null;
  const obj = r as { amount?: unknown; unit?: unknown };
  const amount = typeof obj.amount === 'number' ? Math.max(0, Math.floor(obj.amount)) : NaN;
  const unit = obj.unit;
  if (!Number.isFinite(amount)) return null;
  if (unit !== 'minute' && unit !== 'hour' && unit !== 'day' && unit !== 'week') return null;
  return { amount, unit };
}

export function setStoredReminders(taskId: number, reminders: Reminder[]): void {
  if (!isNative()) return;
  try {
    if (!reminders || reminders.length === 0) {
      localStorage.removeItem(STORAGE_PREFIX + taskId);
    } else {
      const limited = reminders.slice(0, MAX_REMINDERS_PER_TASK);
      localStorage.setItem(STORAGE_PREFIX + taskId, JSON.stringify(limited));
    }
  } catch {}
}

export async function requestReminderPermission(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const status = await LocalNotifications.checkPermissions();
    if (status.display === 'granted') return true;
    const req = await LocalNotifications.requestPermissions();
    return req.display === 'granted';
  } catch {
    return false;
  }
}

function reminderToTimestamp(dueDateStr: string, r: Reminder): number | null {
  const [y, m, d] = dueDateStr.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  const dueDate = new Date(y, m - 1, d);
  if (isNaN(dueDate.getTime())) return null;

  const notifyAt = new Date(dueDate);
  if (r.unit === 'day') {
    notifyAt.setDate(notifyAt.getDate() - r.amount);
    notifyAt.setHours(9, 0, 0, 0);
  } else if (r.unit === 'week') {
    notifyAt.setDate(notifyAt.getDate() - r.amount * 7);
    notifyAt.setHours(9, 0, 0, 0);
  } else if (r.unit === 'hour') {
    // Anchor due date to 9am, then subtract hours
    notifyAt.setHours(9, 0, 0, 0);
    notifyAt.setTime(notifyAt.getTime() - r.amount * 60 * 60 * 1000);
  } else if (r.unit === 'minute') {
    notifyAt.setHours(9, 0, 0, 0);
    notifyAt.setTime(notifyAt.getTime() - r.amount * 60 * 1000);
  } else {
    return null;
  }
  const now = new Date();
  if (notifyAt.getTime() <= now.getTime()) return null;
  return notifyAt.getTime();
}

/**
 * Combine a task id with a small index to form a stable notification id.
 * Caps per-task reminders at MAX_REMINDERS_PER_TASK to keep ids non-overlapping
 * across tasks (assumes task ids fit in 31 bits with room for the index).
 */
function notificationId(taskId: number, index: number): number {
  return taskId * 16 + (index % 16);
}

export async function scheduleReminders(
  taskId: number,
  taskName: string,
  dueDate: string,
  reminders: Reminder[]
): Promise<void> {
  if (!isNative()) return;
  // Always cancel previous reminders for this task before re-scheduling
  await cancelReminder(taskId);
  if (!reminders || reminders.length === 0) return;

  const { LocalNotifications } = await import('@capacitor/local-notifications');
  const granted = await requestReminderPermission();
  if (!granted) return;

  const limited = reminders.slice(0, MAX_REMINDERS_PER_TASK);
  const scheduled: { id: number; title: string; body: string; schedule: { at: Date } }[] = [];
  limited.forEach((r, i) => {
    const ts = reminderToTimestamp(dueDate, r);
    if (ts == null) return;
    scheduled.push({
      id: notificationId(taskId, i),
      title: 'Task due',
      body: taskName,
      schedule: { at: new Date(ts) },
    });
  });

  if (scheduled.length === 0) return;
  try {
    await LocalNotifications.schedule({ notifications: scheduled });
    setStoredReminders(taskId, limited);
  } catch {}
}

/** Legacy single-reminder API. Maps to new multi-reminder system. */
export async function scheduleReminder(
  taskId: number,
  taskName: string,
  dueDate: string,
  offset: ReminderOffset
): Promise<void> {
  if (offset === 'off') {
    await cancelReminder(taskId);
    return;
  }
  const r = legacyToReminder(offset);
  if (!r) return;
  await scheduleReminders(taskId, taskName, dueDate, [r]);
}

export async function cancelReminder(taskId: number): Promise<void> {
  if (!isNative()) return;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const ids: { id: number }[] = [];
    for (let i = 0; i < MAX_REMINDERS_PER_TASK; i++) {
      ids.push({ id: notificationId(taskId, i) });
    }
    // Also cancel the legacy id (taskId alone) for older versions
    ids.push({ id: taskId });
    await LocalNotifications.cancel({ notifications: ids });
    setStoredReminders(taskId, []);
  } catch {}
}

/** Format a reminder for display. */
export function formatReminder(r: Reminder): string {
  if (r.unit === 'day' && r.amount === 0) return 'On the day';
  const unitLabel = r.unit + (r.amount === 1 ? '' : 's');
  return `${r.amount} ${unitLabel} before`;
}
