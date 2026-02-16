/**
 * Settings that get included in backups and restored on load.
 * Add new settings here when implementing new preferences.
 */
import { loadPriorityColors, savePriorityColors, DEFAULT_PRIORITY_COLORS } from './priorityColors';
import type { PriorityColors } from './priorityColors';

export interface BackupSettings {
  priorityColors?: PriorityColors;
  [key: string]: unknown;
}

export function getSettingsForBackup(): BackupSettings {
  return {
    priorityColors: { ...loadPriorityColors() },
  };
}

export function applySettingsFromBackup(settings: BackupSettings | undefined): void {
  if (!settings || typeof settings !== 'object') return;

  if (settings.priorityColors && typeof settings.priorityColors === 'object') {
    const colors = settings.priorityColors as Record<number, { bg: string; progress: string }>;
    const valid: PriorityColors = {};
    for (let p = 1; p <= 10; p++) {
      const v = colors[p];
      if (v?.bg && v?.progress) valid[p] = { bg: v.bg, progress: v.progress };
    }
    if (Object.keys(valid).length > 0) {
      savePriorityColors({ ...DEFAULT_PRIORITY_COLORS, ...valid });
    }
  }
}
