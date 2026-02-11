import { useMemo, useState } from 'react';
import { Gantt, Task as GanttTask, ViewMode } from 'gantt-task-react';
import type { Category, Project, Task } from '../types';
import 'gantt-task-react/dist/index.css';
import './GanttChart.css';

interface Props {
  tasks: Task[];
  projects: Project[];
  categories: Category[];
  includeCompleted: boolean;
  onIncludeCompletedChange: (v: boolean) => void;
  onTaskChange: (id: number, data: { start_date?: string; end_date?: string; progress?: number }) => void;
  onTaskComplete: (id: number) => void;
  onTaskDelete: (id: number, cascade: boolean) => void;
  onTaskSplit: (task: Task) => void;
}

const PRIORITY_COLORS: Record<number, { bg: string; progress: string }> = {
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

function toGanttTask(t: Task, projects: Project[]): GanttTask {
  const project = projects.find((p) => p.id === t.project_id);
  const tier = Math.max(1, Math.min(10, t.base_priority ?? 5)) as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
  const colors = PRIORITY_COLORS[tier];
  return {
    id: String(t.id),
    name: t.name,
    start: new Date(t.start_date),
    end: new Date(t.end_date),
    progress: t.completed ? 100 : t.progress,
    type: 'task',
    project: project?.name || t.project_name || '',
    isDisabled: t.completed,
    styles: t.completed
      ? { backgroundColor: '#475569', progressColor: '#64748b' }
      : { backgroundColor: colors.bg, progressColor: colors.progress },
  };
}

export default function GanttChart({
  tasks,
  projects,
  includeCompleted,
  onIncludeCompletedChange,
  onTaskChange,
  onTaskComplete,
  onTaskDelete,
  onTaskSplit,
}: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.Day);

  const ganttTasks = useMemo(() => {
    return tasks
      .sort((a, b) => {
        // Higher urgency first; then by start date
        const uA = (a as Task & { urgency?: number }).urgency ?? 0;
        const uB = (b as Task & { urgency?: number }).urgency ?? 0;
        if (uB !== uA) return uB - uA;
        return new Date(a.start_date).getTime() - new Date(b.start_date).getTime();
      })
      .map((t) => toGanttTask(t, projects));
  }, [tasks, projects]);

  // gantt-task-react crashes with empty tasks—show placeholder
  if (ganttTasks.length === 0) {
    return (
      <div className="gantt-chart-wrap">
        <div className="gantt-empty">
          No tasks yet. Add a category, then a project, then create a task.
        </div>
      </div>
    );
  }

  function handleDateChange(task: GanttTask) {
    onTaskChange(Number(task.id), {
      start_date: task.start.toISOString().slice(0, 10),
      end_date: task.end.toISOString().slice(0, 10),
    });
  }

  function handleProgressChange(task: GanttTask) {
    if (task.progress >= 100) {
      onTaskComplete(Number(task.id));
    } else {
      onTaskChange(Number(task.id), { progress: task.progress });
    }
  }

  function handleDelete(task: GanttTask) {
    onTaskDelete(Number(task.id), true);
  }

  function handleDoubleClick(task: GanttTask) {
    const t = tasks.find((x) => x.id === Number(task.id));
    if (t && !t.completed) onTaskSplit(t);
  }

  return (
    <div className="gantt-chart-wrap">
      <div className="chart-legend">
        <label className="filter-row">
          <input
            type="checkbox"
            checked={includeCompleted}
            onChange={(e) => onIncludeCompletedChange(e.target.checked)}
          />
          Show completed in chart
        </label>
        <span className="legend-note">Tasks by priority (gray = low, red = high)</span>
      </div>
      <div className="gantt-toolbar">
        {([ViewMode.Hour, ViewMode.Day, ViewMode.Week, ViewMode.Month] as const).map((m) => (
          <button
            key={m}
            className={viewMode === m ? 'active' : ''}
            onClick={() => setViewMode(m)}
          >
            {m}
          </button>
        ))}
      </div>
      <div className="gantt-container">
        <Gantt
          tasks={ganttTasks}
          viewMode={viewMode}
          onDateChange={handleDateChange}
          onProgressChange={handleProgressChange}
          onDelete={handleDelete}
          onDoubleClick={handleDoubleClick}
          onClick={() => {}}
          listCellWidth="200"
          columnWidth={52}
          rowHeight={36}
          barFill={75}
          barCornerRadius={8}
          barProgressColor="#818cf8"
          barBackgroundColor="#6366f1"
          barProgressSelectedColor="#a5b4fc"
          barBackgroundSelectedColor="#818cf8"
          todayColor="rgba(99, 102, 241, 0.12)"
          fontSize="13px"
          fontFamily="var(--font-sans)"
        />
      </div>
    </div>
  );
}
