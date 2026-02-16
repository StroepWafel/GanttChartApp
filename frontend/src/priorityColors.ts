export type PriorityColors = Record<number, { bg: string; progress: string }>;

export const DEFAULT_PRIORITY_COLORS: PriorityColors = {
  1: { bg: '#64748b', progress: '#94a3b8' },
  2: { bg: '#64748b', progress: '#94a3b8' },
  3: { bg: '#6366f1', progress: '#818cf8' },
  4: { bg: '#6366f1', progress: '#818cf8' },
  5: { bg: '#0ea5e9', progress: '#38bdf8' },
  6: { bg: '#0ea5e9', progress: '#38bdf8' },
  7: { bg: '#22c55e', progress: '#4ade80' },
  8: { bg: '#eab308', progress: '#facc15' },
  9: { bg: '#f97316', progress: '#fb923c' },
  10: { bg: '#ef4444', progress: '#f87171' },
};

const STORAGE_KEY = 'gantt_priority_colors';

export function loadPriorityColors(): PriorityColors {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return { ...DEFAULT_PRIORITY_COLORS };
    const parsed = JSON.parse(stored) as Record<string, { bg: string; progress: string }>;
    const result: PriorityColors = { ...DEFAULT_PRIORITY_COLORS };
    for (const [k, v] of Object.entries(parsed)) {
      const n = parseInt(k, 10);
      if (n >= 1 && n <= 10 && v?.bg && v?.progress) {
        result[n] = { bg: v.bg, progress: v.progress };
      }
    }
    return result;
  } catch {
    return { ...DEFAULT_PRIORITY_COLORS };
  }
}

export function savePriorityColors(colors: PriorityColors): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(colors));
}
