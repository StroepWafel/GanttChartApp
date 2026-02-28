/**
 * Due date reminders via @capacitor/local-notifications.
 * Only active on mobile native (Capacitor).
 */

const STORAGE_PREFIX = 'gantt_reminder_';

export type ReminderOffset = 'off' | '1d' | 'day' | '1h';

export function isMobileNative(): boolean {
  return typeof (window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform === 'function' &&
    !!(window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();
}

function isNative(): boolean {
  return isMobileNative();
}

export function getStoredReminder(taskId: number): ReminderOffset {
  if (!isNative()) return 'off';
  try {
    const v = localStorage.getItem(STORAGE_PREFIX + taskId);
    if (v === '1d' || v === 'day' || v === '1h') return v;
  } catch {}
  return 'off';
}

export function setStoredReminder(taskId: number, offset: ReminderOffset): void {
  if (!isNative()) return;
  try {
    if (offset === 'off') {
      localStorage.removeItem(STORAGE_PREFIX + taskId);
    } else {
      localStorage.setItem(STORAGE_PREFIX + taskId, offset);
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

function dueDateToTimestamp(dueDateStr: string, offset: ReminderOffset): number | null {
  const [y, m, d] = dueDateStr.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  const dueDate = new Date(y, m - 1, d);
  if (isNaN(dueDate.getTime())) return null;

  let notifyAt: Date;
  if (offset === '1d') {
    notifyAt = new Date(dueDate);
    notifyAt.setDate(notifyAt.getDate() - 1);
    notifyAt.setHours(9, 0, 0, 0);
  } else if (offset === 'day') {
    notifyAt = new Date(dueDate);
    notifyAt.setHours(9, 0, 0, 0);
  } else if (offset === '1h') {
    notifyAt = new Date(dueDate);
    notifyAt.setHours(8, 0, 0, 0);
  } else {
    return null;
  }
  const now = new Date();
  if (notifyAt.getTime() <= now.getTime()) return null;
  return notifyAt.getTime();
}

export async function scheduleReminder(
  taskId: number,
  taskName: string,
  dueDate: string,
  offset: ReminderOffset
): Promise<void> {
  if (!isNative() || offset === 'off') return;
  const ts = dueDateToTimestamp(dueDate, offset);
  if (ts == null) return;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const granted = await requestReminderPermission();
    if (!granted) return;
    await LocalNotifications.schedule({
      notifications: [
        {
          id: taskId,
          title: 'Task due',
          body: taskName,
          schedule: { at: new Date(ts) },
        },
      ],
    });
    setStoredReminder(taskId, offset);
  } catch {}
}

export async function cancelReminder(taskId: number): Promise<void> {
  if (!isNative()) return;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    await LocalNotifications.cancel({ notifications: [{ id: taskId }] });
    setStoredReminder(taskId, 'off');
  } catch {}
}
