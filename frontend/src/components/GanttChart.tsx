import { useMemo, useState } from 'react';
import { Gantt, Task as GanttTask, ViewMode } from 'gantt-task-react';
import type { Category, Project, Task } from '../types';
import 'gantt-task-react/dist/index.css';
import './GanttChart.css';

interface Props {
  tasks: Task[];
  projects: Project[];
  categories: Category[];
  onTaskChange: (id: number, data: { start_date?: string; end_date?: string; progress?: number }) => void;
  onTaskComplete: (id: number) => void;
  onTaskDelete: (id: number, cascade: boolean) => void;
  onTaskSplit: (task: Task) => void;
}

function toGanttTask(t: Task, projects: Project[]): GanttTask {
  const project = projects.find((p) => p.id === t.project_id);
  const type = t.parent_id ? 'task' : 'task';
  return {
    id: String(t.id),
    name: t.name,
    start: new Date(t.start_date),
    end: new Date(t.end_date),
    progress: t.completed ? 100 : t.progress,
    type,
    project: project?.name || t.project_name || '',
    isDisabled: t.completed,
  };
}

export default function GanttChart({
  tasks,
  projects,
  onTaskChange,
  onTaskComplete,
  onTaskDelete,
  onTaskSplit,
}: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.Day);

  const ganttTasks = useMemo(() => {
    return tasks
      .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime())
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
          listCellWidth="180"
          columnWidth={50}
          rowHeight={28}
          barFill={70}
          barCornerRadius={2}
          barProgressColor="#3b82f6"
          barBackgroundColor="#374151"
          fontSize="12px"
          fontFamily="var(--font-sans)"
        />
      </div>
    </div>
  );
}
