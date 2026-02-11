import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { ChevronDown, ChevronRight, Pencil } from 'lucide-react';
import * as api from '../api';
import type { Category, Project, Task } from '../types';
import './GanttChart.css';

type ViewMode = 'Day' | 'Week' | 'Month';

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

interface ExpandedState {
  category: Record<number, boolean>;
  project: Record<number, boolean>;
  task: Record<number, boolean>;
}

function isExpanded(state: ExpandedState, type: keyof ExpandedState, id: number): boolean {
  const val = state[type][id];
  return val === undefined ? true : val;
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

function diffDays(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / (24 * 60 * 60 * 1000));
}

function getColumnForIndex(
  rangeStart: Date,
  i: number,
  viewMode: ViewMode
): { date: Date; label: string; subLabel: string } {
  let d: Date;
  if (viewMode === 'Day') {
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

type GanttRow =
  | { type: 'category'; id: string; category: Category }
  | { type: 'project'; id: string; project: Project }
  | { type: 'task'; task: Task; indent: number };

function buildHierarchicalRows(
  tasks: Task[],
  projects: Project[],
  categories: Category[],
  expanded: ExpandedState
): GanttRow[] {
  const rows: GanttRow[] = [];
  const byParent = new Map<number, Task[]>();
  tasks.filter((t) => t.parent_id).forEach((t) => {
    const pid = t.parent_id!;
    if (!byParent.has(pid)) byParent.set(pid, []);
    byParent.get(pid)!.push(t);
  });
  const sortedCats = [...categories].sort((a, b) => a.display_order - b.display_order);
  for (const cat of sortedCats) {
    const catProjects = projects.filter((p) => p.category_id === cat.id);
    if (catProjects.length === 0) continue;
    rows.push({ type: 'category', id: `cat-${cat.id}`, category: cat });
    if (!isExpanded(expanded, 'category', cat.id)) continue;
    for (const proj of catProjects) {
      rows.push({ type: 'project', id: `proj-${proj.id}`, project: proj });
      if (!isExpanded(expanded, 'project', proj.id)) continue;
      const projTasks = tasks
        .filter((t) => t.project_id === proj.id)
        .sort((a, b) => {
          const uA = (a as Task & { urgency?: number }).urgency ?? 0;
          const uB = (b as Task & { urgency?: number }).urgency ?? 0;
          if (uB !== uA) return uB - uA;
          return new Date(a.start_date).getTime() - new Date(b.start_date).getTime();
        });
      const topLevel = projTasks.filter((t) => !t.parent_id);
      if (topLevel.length === 0 && projTasks.length === 0) continue;
      for (const task of topLevel) {
        const children = byParent.get(task.id) ?? [];
        if (children.length > 0) {
          rows.push({ type: 'task', task, indent: 2 });
          if (isExpanded(expanded, 'task', task.id)) {
            for (const child of children) {
              rows.push({ type: 'task', task: child, indent: 3 });
            }
          }
        } else {
          rows.push({ type: 'task', task, indent: 2 });
        }
      }
    }
  }
  return rows;
}

export default function GanttChart({
  tasks,
  projects,
  categories,
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
  const [expanded, setExpanded] = useState<ExpandedState>({
    category: {},
    project: {},
    task: {},
  });

  useEffect(() => {
    api.getGanttExpanded().then((data) => {
      setExpanded({
        category: data.category ?? {},
        project: data.project ?? {},
        task: data.task ?? {},
      });
    });
  }, []);

  const toggleExpanded = useCallback(
    async (type: 'category' | 'project' | 'task', id: number) => {
      const next = !isExpanded(expanded, type, id);
      setExpanded((prev) => ({
        ...prev,
        [type]: { ...prev[type], [id]: next },
      }));
      await api.setGanttExpanded(type, id, next);
    },
    [expanded]
  );

  const hierarchicalRows = useMemo(
    () => buildHierarchicalRows(tasks, projects, categories, expanded),
    [tasks, projects, categories, expanded]
  );
  const taskRows = useMemo(
    () => hierarchicalRows.filter((r): r is Extract<GanttRow, { type: 'task' }> => r.type === 'task'),
    [hierarchicalRows]
  );

  const { projectBars, categoryBars, projectSpans, categorySpans } = useMemo(() => {
    type Bar = { start: string; end: string };
    const projBars = new Map<number, Bar[]>();
    const catBars = new Map<number, Bar[]>();
    const projSpans = new Map<number, { start: string; end: string }>();
    const catSpans = new Map<number, { start: string; end: string }>();

    for (const p of projects) {
      const projTasks = tasks.filter((t) => t.project_id === p.id);
      if (projTasks.length > 0) {
        const bars: Bar[] = projTasks.map((t) => ({ start: t.start_date, end: t.end_date }));
        projBars.set(p.id, bars);
        const start = projTasks.reduce((a, t) => (t.start_date < a ? t.start_date : a), projTasks[0].start_date);
        const end = projTasks.reduce((a, t) => (t.end_date > a ? t.end_date : a), projTasks[0].end_date);
        projSpans.set(p.id, { start, end });
      } else {
        const start = p.start_date ?? p.due_date ?? new Date().toISOString().slice(0, 10);
        const end = p.due_date ?? p.start_date ?? new Date().toISOString().slice(0, 10);
        projSpans.set(p.id, { start, end });
      }
    }

    for (const c of categories) {
      const catProjects = projects.filter((p) => p.category_id === c.id);
      const allBars: Bar[] = [];
      for (const p of catProjects) {
        const bars = projBars.get(p.id);
        if (bars) allBars.push(...bars);
      }
      if (allBars.length > 0) {
        catBars.set(c.id, allBars);
        const start = allBars.reduce((a, b) => (b.start < a ? b.start : a), allBars[0].start);
        const end = allBars.reduce((a, b) => (b.end > a ? b.end : a), allBars[0].end);
        catSpans.set(c.id, { start, end });
      }
    }
    return { projectBars: projBars, categoryBars: catBars, projectSpans: projSpans, categorySpans: catSpans };
  }, [tasks, projects, categories]);

  const { rangeStart, rangeEnd, columnWidth, totalWidth, totalColumns } = useMemo(() => {
    const allTasks = taskRows.map((r) => r.task);
    const allStarts = allTasks.map((t: Task) => new Date(t.start_date));
    const relevantDates: Date[] = [];
    for (const t of allTasks) {
      relevantDates.push(new Date(t.end_date));
      if (t.due_date) relevantDates.push(new Date(t.due_date));
      const proj = projects.find((p) => p.id === t.project_id);
      if (proj?.due_date) relevantDates.push(new Date(proj.due_date));
      if (proj?.start_date) allStarts.push(new Date(proj.start_date));
    }
    for (const p of projects) {
      if (p.start_date) allStarts.push(new Date(p.start_date));
      if (p.due_date) relevantDates.push(new Date(p.due_date));
    }
    const minDate = allStarts.length
      ? new Date(Math.min(...allStarts.map((d: Date) => d.getTime())))
      : new Date();
    const latestRelevant = relevantDates.length
      ? new Date(Math.max(...relevantDates.map((d: Date) => d.getTime())))
      : addDays(new Date(), 14);
    const maxDate = addDays(latestRelevant, 7);

    let start: Date;
    let colCount: number;
    const colWidth = viewMode === 'Month' ? 80 : viewMode === 'Week' ? 56 : 48;

    const hasTasks = relevantDates.length > 0;
    if (viewMode === 'Day') {
      start = toStartOfDay(minDate);
      start.setDate(start.getDate() - 7);
      const end = toStartOfDay(maxDate);
      colCount = diffDays(end, start) + 1;
      if (!hasTasks && colCount < 60) colCount = 60;
    } else if (viewMode === 'Week') {
      start = toStartOfWeek(minDate);
      start.setDate(start.getDate() - 14);
      const end = toStartOfWeek(maxDate);
      colCount = Math.ceil(diffDays(end, start) / 7) + 1;
      if (!hasTasks && colCount < 12) colCount = 12;
    } else {
      start = toStartOfMonth(minDate);
      start.setMonth(start.getMonth() - 1);
      const end = toStartOfMonth(maxDate);
      colCount = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;
      if (!hasTasks && colCount < 6) colCount = 6;
    }

    const rangeEndDate =
      viewMode === 'Month'
        ? addMonths(start, colCount)
        : viewMode === 'Week'
        ? addWeeks(start, colCount)
        : addDays(start, colCount);

    return {
      rangeStart: start,
      rangeEnd: rangeEndDate,
      columnWidth: colWidth,
      totalWidth: colCount * colWidth,
      totalColumns: colCount,
    };
  }, [taskRows, projects, viewMode]);

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

  function getSpanLayout(startStr: string, endStr: string) {
    const start = new Date(startStr);
    const end = new Date(endStr);
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

  if (taskRows.length === 0 && hierarchicalRows.length === 0) {
    return (
      <div className="gantt-chart-wrap">
        <div className="gantt-empty">
          No tasks yet. Add a category, then a project, then create a task.
        </div>
      </div>
    );
  }

  const rowHeight = 36;
  const listWidth = 420;

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
        {(['Day', 'Week', 'Month'] as const).map((m) => (
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
          style={{ minWidth: listWidth + totalWidth, minHeight: 40 + hierarchicalRows.length * rowHeight }}
        >
        <div className="gantt-list" style={{ width: listWidth }}>
          <div className="gantt-list-header">
            <span />
            <span className="gantt-hdr-task">Task</span>
            <span className="gantt-hdr-from">From</span>
            <span className="gantt-hdr-to">To</span>
          </div>
          {hierarchicalRows.map((row) => {
            if (row.type === 'category') {
              const exp = isExpanded(expanded, 'category', row.category.id);
              const hasChildren = projects.some((p) => p.category_id === row.category.id);
              const catSpan = categorySpans.get(row.category.id);
              return (
                <div key={row.id} className="gantt-list-row gantt-row-category">
                  <div className="gantt-row-expand">
                    {hasChildren ? (
                      <button
                        type="button"
                        className="gantt-expand-btn"
                        onClick={() => toggleExpanded('category', row.category.id)}
                        title={exp ? 'Collapse' : 'Expand'}
                        aria-label={exp ? 'Collapse' : 'Expand'}
                      >
                        {exp ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                    ) : (
                      <span className="gantt-expand-spacer" />
                    )}
                  </div>
                  <span className="gantt-list-name">{row.category.name}</span>
                  <span className="gantt-list-date">
                    {catSpan ? new Date(catSpan.start).toLocaleDateString() : '—'}
                  </span>
                  <span className="gantt-list-date">
                    {catSpan ? new Date(catSpan.end).toLocaleDateString() : '—'}
                  </span>
                </div>
              );
            }
            if (row.type === 'project') {
              const exp = isExpanded(expanded, 'project', row.project.id);
              const hasChildren = tasks.some((t) => t.project_id === row.project.id);
              const span = projectSpans.get(row.project.id);
              return (
                <div key={row.id} className="gantt-list-row gantt-row-project">
                  <div className="gantt-row-expand">
                    {hasChildren ? (
                      <button
                        type="button"
                        className="gantt-expand-btn"
                        onClick={() => toggleExpanded('project', row.project.id)}
                        title={exp ? 'Collapse' : 'Expand'}
                        aria-label={exp ? 'Collapse' : 'Expand'}
                      >
                        {exp ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                    ) : (
                      <span className="gantt-expand-spacer" />
                    )}
                  </div>
                  <span className="gantt-list-name" style={{ paddingLeft: 8 }}>{row.project.name}</span>
                  <span className="gantt-list-date">
                    {span ? new Date(span.start).toLocaleDateString() : '—'}
                  </span>
                  <span className="gantt-list-date">
                    {span ? new Date(span.end).toLocaleDateString() : '—'}
                  </span>
                </div>
              );
            }
            const children = tasks.filter((t) => t.parent_id === row.task.id);
            const hasChildren = children.length > 0;
            const exp = hasChildren ? isExpanded(expanded, 'task', row.task.id) : true;
            return (
              <div
                key={row.task.id}
                className={`gantt-list-row ${row.task.completed ? 'completed' : ''}`}
              >
                <div className="gantt-row-expand">
                  {hasChildren ? (
                    <button
                      type="button"
                      className="gantt-expand-btn"
                      onClick={() => toggleExpanded('task', row.task.id)}
                      title={exp ? 'Collapse' : 'Expand'}
                      aria-label={exp ? 'Collapse' : 'Expand'}
                    >
                      {exp ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                  ) : (
                    <span className="gantt-expand-spacer" />
                  )}
                </div>
                <span className="gantt-list-name" style={{ paddingLeft: 8 + row.indent * 14 }}>{row.task.name}</span>
                <span className="gantt-list-date">
                  {new Date(row.task.start_date).toLocaleDateString()}
                </span>
                <span className="gantt-list-date">
                  {new Date(row.task.end_date).toLocaleDateString()}
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
                    height: hierarchicalRows.length * rowHeight,
                  }}
                />
              )}
              {hierarchicalRows.map((row) => {
                if (row.type === 'category') {
                  const bars = categoryBars.get(row.category.id);
                  if (!bars || bars.length === 0) {
                    return <div key={row.id} className="gantt-row gantt-row-empty" style={{ height: rowHeight }} />;
                  }
                  return (
                    <div key={row.id} className="gantt-row" style={{ height: rowHeight }}>
                      {bars.map((bar, i) => {
                        const { x, w } = getSpanLayout(bar.start, bar.end);
                        return (
                          <div
                            key={i}
                            className="gantt-bar gantt-bar-summary gantt-bar-category"
                            style={{ left: x, width: w, backgroundColor: '#475569' }}
                          />
                        );
                      })}
                    </div>
                  );
                }
                if (row.type === 'project') {
                  const bars = projectBars.get(row.project.id);
                  if (!bars || bars.length === 0) {
                    return <div key={row.id} className="gantt-row gantt-row-empty" style={{ height: rowHeight }} />;
                  }
                  return (
                    <div key={row.id} className="gantt-row" style={{ height: rowHeight }}>
                      {bars.map((bar, i) => {
                        const { x, w } = getSpanLayout(bar.start, bar.end);
                        return (
                          <div
                            key={i}
                            className="gantt-bar gantt-bar-summary gantt-bar-project"
                            style={{ left: x, width: w, backgroundColor: '#64748b' }}
                          />
                        );
                      })}
                    </div>
                  );
                }
                const { task } = row;
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
                        <Pencil size={12} />
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
