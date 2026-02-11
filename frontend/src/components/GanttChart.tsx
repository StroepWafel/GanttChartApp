import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import type { Category, Project, Task } from '../types';
import './GanttChart.css';

type ViewMode = 'Hour' | 'Day' | 'Week' | 'Month';

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
  onTaskEdit: (task: Task) => void;
}

function toStartOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function toStartOfWeek(d: Date): Date {
  const x = new Date(d);
  const day = x.getDay();
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}

function toStartOfMonth(d: Date): Date {
  const x = new Date(d);
  x.setDate(1);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function addWeeks(d: Date, n: number): Date {
  return addDays(d, n * 7);
}

function addMonths(d: Date, n: number): Date {
  const x = new Date(d);
  x.setMonth(x.getMonth() + n);
  return x;
}

function addYears(d: Date, n: number): Date {
  const x = new Date(d);
  x.setFullYear(x.getFullYear() + n);
  return x;
}

function diffDays(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / (24 * 60 * 60 * 1000));
}

const YEARS_AHEAD = 12;

function getColumnForIndex(
  rangeStart: Date,
  i: number,
  viewMode: ViewMode
): { date: Date; label: string; subLabel: string } {
  let d: Date;
  if (viewMode === 'Hour' || viewMode === 'Day') {
    d = addDays(rangeStart, i);
    return {
      date: d,
      label: d.toLocaleDateString('en-US', { weekday: 'short' }),
      subLabel: d.getDate().toString(),
    };
  }
  if (viewMode === 'Week') {
    d = addWeeks(rangeStart, i);
    return {
      date: d,
      label: `W${Math.ceil(d.getDate() / 7)}`,
      subLabel: d.toLocaleDateString('en-US', { month: 'short' }),
    };
  }
  d = addMonths(rangeStart, i);
  return {
    date: d,
    label: d.toLocaleDateString('en-US', { month: 'short' }),
    subLabel: d.getFullYear().toString(),
  };
}

export default function GanttChart({
  tasks,
  projects: _projects,
  includeCompleted,
  onIncludeCompletedChange,
  onTaskChange: _onTaskChange,
  onTaskComplete,
  onTaskDelete,
  onTaskSplit,
  onTaskEdit,
}: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>('Day');
  const [tooltip, setTooltip] = useState<{ task: Task; x: number; y: number } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ task: Task; x: number; y: number } | null>(null);

  const sortedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
      const uA = (a as Task & { urgency?: number }).urgency ?? 0;
      const uB = (b as Task & { urgency?: number }).urgency ?? 0;
      if (uB !== uA) return uB - uA;
      return new Date(a.start_date).getTime() - new Date(b.start_date).getTime();
    });
  }, [tasks]);

  const { rangeStart, rangeEnd, columnWidth, totalWidth, totalColumns } = useMemo(() => {
    const allStarts = sortedTasks.map((t) => new Date(t.start_date));
    const allEnds = sortedTasks.map((t) => new Date(t.end_date));
    const minDate = allStarts.length
      ? new Date(Math.min(...allStarts.map((d) => d.getTime())))
      : new Date();
    const maxTaskEnd = allEnds.length
      ? new Date(Math.max(...allEnds.map((d) => d.getTime())))
      : addDays(new Date(), 14);
    const horizon = addYears(new Date(), YEARS_AHEAD);
    const maxDate = maxTaskEnd.getTime() > horizon.getTime() ? maxTaskEnd : horizon;

    let start: Date;
    let colCount: number;
    const colWidth = viewMode === 'Month' ? 80 : viewMode === 'Week' ? 56 : 48;

    if (viewMode === 'Hour' || viewMode === 'Day') {
      start = toStartOfDay(minDate);
      start.setDate(start.getDate() - 7);
      const end = toStartOfDay(maxDate);
      colCount = diffDays(end, start) + 14;
      if (colCount < 365) colCount = 365;
    } else if (viewMode === 'Week') {
      start = toStartOfWeek(minDate);
      start.setDate(start.getDate() - 14);
      const end = toStartOfWeek(maxDate);
      colCount = Math.ceil(diffDays(end, start) / 7) + 8;
      if (colCount < 52) colCount = 52;
    } else {
      start = toStartOfMonth(minDate);
      start.setMonth(start.getMonth() - 1);
      const end = toStartOfMonth(maxDate);
      colCount = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 3;
      if (colCount < 24) colCount = 24;
    }

    const end = viewMode === 'Month'
      ? addMonths(start, colCount - 1)
      : viewMode === 'Week'
      ? addWeeks(start, colCount - 1)
      : addDays(start, colCount - 1);

    return {
      rangeStart: start,
      rangeEnd: end,
      columnWidth: colWidth,
      totalWidth: colCount * colWidth,
      totalColumns: colCount,
    };
  }, [sortedTasks, viewMode]);

  const [scrollState, setScrollState] = useState({ scrollLeft: 0, width: 800 });
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setScrollState({ scrollLeft: el.scrollLeft, width: el.clientWidth });
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => handleScroll());
    ro.observe(el);
    handleScroll();
    return () => ro.disconnect();
  }, [handleScroll]);

  const BUFFER = 5;
  const firstVisible = Math.max(0, Math.floor(scrollState.scrollLeft / columnWidth) - BUFFER);
  const lastVisible = Math.min(
    totalColumns - 1,
    Math.ceil((scrollState.scrollLeft + scrollState.width) / columnWidth) + BUFFER
  );
  const visibleColumnCount = Math.max(0, lastVisible - firstVisible + 1);

  const rangeMs = rangeEnd.getTime() - rangeStart.getTime();

  function dateToX(date: Date): number {
    const ms = date.getTime() - rangeStart.getTime();
    return Math.max(0, (ms / rangeMs) * totalWidth);
  }

  function getBarLayout(task: Task) {
    const start = new Date(task.start_date);
    const end = new Date(task.end_date);
    const x = dateToX(start);
    const w = Math.max(24, dateToX(end) - x);
    return { x, w };
  }

  const handleBarDoubleClick = useCallback(
    (task: Task) => {
      if (!task.completed) onTaskSplit(task);
    },
    [onTaskSplit]
  );

  const handleEditClick = useCallback(
    (e: React.MouseEvent, task: Task) => {
      e.stopPropagation();
      e.preventDefault();
      setTooltip(null);
      onTaskEdit(task);
    },
    [onTaskEdit]
  );

  const handleBarContextMenu = useCallback((e: React.MouseEvent, task: Task) => {
    e.preventDefault();
    setContextMenu({ task, x: e.clientX, y: e.clientY });
    setTooltip(null);
  }, []);

  const handleDeleteTask = useCallback(() => {
    if (contextMenu) {
      onTaskDelete(contextMenu.task.id, true);
      setContextMenu(null);
    }
  }, [contextMenu, onTaskDelete]);

  const handleCompleteTask = useCallback(() => {
    if (contextMenu) {
      onTaskComplete(contextMenu.task.id);
      setContextMenu(null);
    }
  }, [contextMenu, onTaskComplete]);

  useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  const todayX = dateToX(new Date());
  const todayInRange = todayX >= 0 && todayX <= totalWidth;

  if (sortedTasks.length === 0) {
    return (
      <div className="gantt-chart-wrap">
        <div className="gantt-empty">
          No tasks yet. Add a category, then a project, then create a task.
        </div>
      </div>
    );
  }

  const rowHeight = 36;
  const listWidth = 200;

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
        <div className="priority-strip">
          <span className="priority-label">Priority:</span>
          {[
            [1, 2, '#64748b'],
            [3, 4, '#6366f1'],
            [5, 6, '#0ea5e9'],
            [7, 7, '#22c55e'],
            [8, 8, '#eab308'],
            [9, 9, '#f97316'],
            [10, 10, '#ef4444'],
          ].map(([lo, hi, color]) => (
            <span
              key={String(lo)}
              className="priority-swatch"
              style={{ backgroundColor: color as string }}
              title={`${lo}-${hi}`}
            />
          ))}
          <span className="priority-range">1 low → 10 high</span>
        </div>
      </div>

      <div className="gantt-toolbar">
        {(['Hour', 'Day', 'Week', 'Month'] as const).map((m) => (
          <button
            key={m}
            className={viewMode === m ? 'active' : ''}
            onClick={() => setViewMode(m)}
          >
            {m}
          </button>
        ))}
      </div>

      <div
        ref={scrollRef}
        className="gantt-main"
        onScroll={handleScroll}
      >
        <div
          className="gantt-inner"
          style={{ minWidth: listWidth + totalWidth, minHeight: 40 + sortedTasks.length * rowHeight }}
        >
        <div className="gantt-list" style={{ width: listWidth }}>
          <div className="gantt-list-header">
            <span>Task</span>
            <span>From</span>
            <span>To</span>
          </div>
          {sortedTasks.map((task) => {
            return (
              <div
                key={task.id}
                className={`gantt-list-row ${task.completed ? 'completed' : ''}`}
              >
                <span className="gantt-list-name">{task.name}</span>
                <span className="gantt-list-date">
                  {new Date(task.start_date).toLocaleDateString()}
                </span>
                <span className="gantt-list-date">
                  {new Date(task.end_date).toLocaleDateString()}
                </span>
              </div>
            );
          })}
        </div>

        <div className="gantt-timeline-wrap" style={{ minWidth: totalWidth }}>
          <div className="gantt-timeline" style={{ width: totalWidth, minWidth: '100%' }}>
            <div className="gantt-header" style={{ width: totalWidth }}>
              {firstVisible > 0 && (
                <div style={{ width: firstVisible * columnWidth, flexShrink: 0 }} aria-hidden />
              )}
              {Array.from({ length: visibleColumnCount }, (_, k) => {
                const i = firstVisible + k;
                const col = getColumnForIndex(rangeStart, i, viewMode);
                return (
                  <div
                    key={i}
                    className="gantt-header-cell"
                    style={{ width: columnWidth }}
                  >
                    <span className="gantt-header-label">{col.label}</span>
                    <span className="gantt-header-sublabel">{col.subLabel}</span>
                  </div>
                );
              })}
              {lastVisible < totalColumns - 1 && (
                <div
                  style={{ width: (totalColumns - 1 - lastVisible) * columnWidth, flexShrink: 0 }}
                  aria-hidden
                />
              )}
            </div>

            <div className="gantt-rows">
              {todayInRange && (
                <div
                  className="gantt-today"
                  style={{
                    left: todayX,
                    top: 0,
                    height: sortedTasks.length * rowHeight,
                  }}
                />
              )}
              {sortedTasks.map((task) => {
                const { x, w } = getBarLayout(task);
                const tier = Math.max(1, Math.min(10, task.base_priority ?? 5));
                const colors = task.completed
                  ? { bg: '#475569', progress: '#64748b' }
                  : PRIORITY_COLORS[tier];
                const progressW = (task.progress / 100) * w;

                return (
                  <div
                    key={task.id}
                    className="gantt-row"
                    style={{ height: rowHeight }}
                  >
                    <div
                      className={`gantt-bar ${task.completed ? 'completed' : ''}`}
                      style={{
                        left: x,
                        width: w,
                        backgroundColor: colors.bg,
                      }}
                      onMouseEnter={(e) => {
                        const rect = (e.target as HTMLElement).getBoundingClientRect();
                        setTooltip({ task, x: rect.left + rect.width / 2, y: rect.top });
                      }}
                      onMouseLeave={() => setTooltip(null)}
                      onDoubleClick={() => handleBarDoubleClick(task)}
                      onContextMenu={(e) => handleBarContextMenu(e, task)}
                    >
                      <div
                        className="gantt-bar-progress"
                        style={{
                          width: progressW,
                          backgroundColor: colors.progress,
                        }}
                      />
                      <span className="gantt-bar-label">{task.name}</span>
                      <button
                        type="button"
                        className="gantt-bar-edit"
                        onClick={(e) => handleEditClick(e, task)}
                        title="Edit task"
                        aria-label="Edit task"
                      >
                        ✎
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        </div>
      </div>

      {tooltip && (
        <div
          className="gantt-tooltip"
          style={{
            position: 'fixed',
            left: tooltip.x,
            top: tooltip.y - 8,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <div className="gantt-tooltip-name">{tooltip.task.name}</div>
          <div className="gantt-tooltip-dates">
            {new Date(tooltip.task.start_date).toLocaleDateString()}
            {' – '}
            {new Date(tooltip.task.end_date).toLocaleDateString()}
          </div>
          <div className="gantt-tooltip-meta">
            Priority {tooltip.task.base_priority ?? 5}/10 · Progress {tooltip.task.progress}%
          </div>
        </div>
      )}

      {contextMenu && (
        <div
          className="gantt-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {!contextMenu.task.completed && (
            <button onClick={handleCompleteTask}>Mark complete</button>
          )}
          <button onClick={handleDeleteTask} className="danger">
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
