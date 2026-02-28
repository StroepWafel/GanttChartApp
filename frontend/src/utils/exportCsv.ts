import type { Task } from '../types';

function escapeCsvField(val: string | number | boolean | null | undefined): string {
  if (val == null) return '';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export function exportTasksToCsv(tasks: Task[]): string {
  const headers = ['name', 'project', 'category', 'start_date', 'end_date', 'due_date', 'priority', 'progress', 'completed'];
  const rows = tasks.map((t) => [
    escapeCsvField(t.name),
    escapeCsvField(t.project_name),
    escapeCsvField(t.category_name),
    escapeCsvField(t.start_date),
    escapeCsvField(t.end_date),
    escapeCsvField(t.due_date ?? ''),
    escapeCsvField(t.base_priority),
    escapeCsvField(t.progress),
    escapeCsvField(t.completed ? 'yes' : 'no'),
  ]);
  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}

export function downloadCsv(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
