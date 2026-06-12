import { useState, useEffect } from 'react';
import type { Category, Project, Task } from '../types';
import { useModal } from '../context/ModalContext';
import type { updateTask } from '../api';
import { scheduleReminders, cancelReminder, getStoredReminders, isMobileNative, formatReminder, type Reminder, type ReminderUnit } from '../reminders';
import MobileSelect from './MobileSelect';
import { Trash2, Plus } from 'lucide-react';

interface Props {
  categories: Category[];
  projects: Project[];
  task?: Task | null;
  onClose: () => void;
  /** When true, render as page content without modal overlay (for mobile) */
  embedded?: boolean;
  onCreate: (data: {
    project_id: number;
    name: string;
    start_date: string;
    end_date: string;
    due_date?: string;
    base_priority?: number;
    api_visible?: boolean;
  }) => void | Promise<{ id: number } | undefined>;
  onUpdate?: (id: number, data: Parameters<typeof updateTask>[1]) => void;
}

export default function TaskForm({ categories, projects, task, onClose, embedded = false, onCreate, onUpdate }: Props) {
  const modal = useModal();
  const today = new Date().toISOString().slice(0, 10);
  const isEdit = !!task;
  const [categoryId, setCategoryId] = useState<number>(categories[0]?.id ?? 0);
  const projectsInCategory = projects.filter((p) => p.category_id === categoryId);
  const [projectId, setProjectId] = useState(projectsInCategory[0]?.id ?? 0);
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [dueDate, setDueDate] = useState('');
  const [basePriority, setBasePriority] = useState(5);
  const [progress, setProgress] = useState(0);
  const [taskVisibleToApi, setTaskVisibleToApi] = useState(true);
  const [reminders, setReminders] = useState<Reminder[]>([]);

  useEffect(() => {
    if (task) {
      const proj = projects.find((p) => p.id === task.project_id);
      if (proj) setCategoryId(proj.category_id);
      setProjectId(task.project_id);
      setName(task.name);
      setStartDate(task.start_date.slice(0, 10));
      setEndDate(task.end_date.slice(0, 10));
      setDueDate(task.due_date?.slice(0, 10) ?? '');
      setBasePriority(task.base_priority ?? 5);
      setProgress(task.progress ?? 0);
      setTaskVisibleToApi((task.api_visible ?? 1) !== 0);
      setReminders(getStoredReminders(task.id));
    } else {
      setTaskVisibleToApi(true);
      setReminders([]);
    }
  }, [task, projects]);

  useEffect(() => {
    if (!projectsInCategory.some((p) => p.id === projectId)) {
      setProjectId(projectsInCategory[0]?.id ?? 0);
    }
  }, [categoryId, projectsInCategory, projectId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId || !name || !startDate || !endDate) return;
    if (endDate < startDate) {
      modal.showAlert({ title: 'Validation', message: 'End date cannot be before start date' });
      return;
    }
    if (dueDate && dueDate < startDate) {
      modal.showAlert({ title: 'Validation', message: 'Due date cannot be before start date' });
      return;
    }
    if (isEdit && task && onUpdate) {
      if (!dueDate || reminders.length === 0) {
        cancelReminder(task.id);
      }
      onUpdate(task.id, {
        project_id: projectId,
        name,
        start_date: startDate,
        end_date: endDate,
        due_date: dueDate || undefined,
        base_priority: basePriority,
        progress,
        api_visible: taskVisibleToApi,
      });
      if (dueDate && reminders.length > 0) {
        scheduleReminders(task.id, name, dueDate, reminders);
      }
    } else {
      const result = await onCreate({
        project_id: projectId,
        name,
        start_date: startDate,
        end_date: endDate,
        due_date: dueDate || undefined,
        base_priority: basePriority,
        api_visible: taskVisibleToApi,
      });
      const created = result && typeof result === 'object' && 'id' in result ? result as { id: number } : null;
      if (created && dueDate && reminders.length > 0) {
        scheduleReminders(created.id, name, dueDate, reminders);
      }
    }
    onClose();
  }

  const formContent = (
    <div className={embedded ? 'task-form-embedded' : 'modal task-form'} onClick={embedded ? undefined : (e: React.MouseEvent) => e.stopPropagation()}>
      <h3>{isEdit ? 'Edit Task' : 'New Task'}</h3>
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <label>Category</label>
            {embedded ? (
              <MobileSelect
                value={categoryId}
                options={categories.map((c) => ({ value: c.id, label: c.name }))}
                onChange={setCategoryId}
                aria-label="Category"
              />
            ) : (
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(Number(e.target.value))}
                required
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )}
          </div>
          <div className="form-row">
            <label>Project</label>
            {embedded ? (
              <MobileSelect
                value={projectId}
                options={projectsInCategory.map((p) => ({ value: p.id, label: p.name }))}
                onChange={setProjectId}
                aria-label="Project"
              />
            ) : (
              <select
                value={projectId}
                onChange={(e) => setProjectId(Number(e.target.value))}
                required
              >
                {projectsInCategory.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            )}
          </div>
          <div className="form-row">
            <label>Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="Task name"
            />
          </div>
          <div className="form-row">
            <label>Start</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                if (endDate && e.target.value > endDate) setEndDate(e.target.value);
                if (dueDate && e.target.value > dueDate) setDueDate('');
              }}
              required
            />
          </div>
          <div className="form-row">
            <label>End</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                const v = e.target.value;
                setEndDate(v);
                if (dueDate && v < dueDate) setDueDate(v);
              }}
              min={startDate}
              required
            />
          </div>
          <div className="form-row">
            <label>Due (optional)</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              min={startDate}
            />
          </div>
          {dueDate && isMobileNative() && (
            <div className="form-row reminders-row">
              <label>Reminders</label>
              <div className="reminders-list">
                {reminders.length === 0 && (
                  <p className="reminders-empty">No reminders. Add one to get notified before this task is due.</p>
                )}
                {reminders.map((r, i) => (
                  <div key={i} className="reminder-item">
                    <input
                      type="number"
                      min={0}
                      max={999}
                      value={r.amount}
                      onChange={(e) => {
                        const v = Math.max(0, Math.min(999, parseInt(e.target.value || '0', 10) || 0));
                        setReminders((prev) => prev.map((x, idx) => (idx === i ? { ...x, amount: v } : x)));
                      }}
                      className="reminder-amount"
                      aria-label="Amount"
                    />
                    <select
                      value={r.unit}
                      onChange={(e) => {
                        const u = e.target.value as ReminderUnit;
                        setReminders((prev) => prev.map((x, idx) => (idx === i ? { ...x, unit: u } : x)));
                      }}
                      className="reminder-unit"
                      aria-label="Unit"
                    >
                      <option value="minute">minute(s)</option>
                      <option value="hour">hour(s)</option>
                      <option value="day">day(s)</option>
                      <option value="week">week(s)</option>
                    </select>
                    <span className="reminder-suffix">before{r.unit === 'day' && r.amount === 0 ? ' (on the day)' : ''}</span>
                    <button
                      type="button"
                      className="btn-sm btn-sm-danger-outline reminder-remove"
                      onClick={() => setReminders((prev) => prev.filter((_, idx) => idx !== i))}
                      aria-label="Remove reminder"
                      title="Remove reminder"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                {reminders.length < 5 && (
                  <button
                    type="button"
                    className="btn-sm reminder-add"
                    onClick={() => setReminders((prev) => [...prev, { amount: 1, unit: 'day' }])}
                  >
                    <Plus size={14} /> Add reminder
                  </button>
                )}
                {reminders.length > 0 && (
                  <div className="reminders-preview">
                    {reminders.map((r, i) => (
                      <span key={i} className="reminder-chip">{formatReminder(r)}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          <div className="form-row">
            <label>Priority (10 = highest, 1 = lowest)</label>
            <div className="priority-input">
              <span className="priority-label">Low</span>
              <input
                type="range"
                min={1}
                max={10}
                value={basePriority}
                onChange={(e) => setBasePriority(Number(e.target.value))}
              />
              <span className="priority-label">High</span>
              <span className="priority-value">{basePriority}</span>
            </div>
          </div>
          {isEdit && (
            <div className="form-row">
              <label>Progress (%)</label>
              <div className="priority-input">
                <span className="priority-label">0</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={progress}
                  onChange={(e) => setProgress(Number(e.target.value))}
                />
                <span className="priority-label">100</span>
                <span className="priority-value">{progress}</span>
              </div>
            </div>
          )}
          <div className="form-row settings-checkbox-row">
            <input
              type="checkbox"
              id="task-visible-to-api"
              checked={taskVisibleToApi}
              onChange={(e) => setTaskVisibleToApi(e.target.checked)}
            />
            <label htmlFor="task-visible-to-api">Visible to API</label>
          </div>
          <div className="form-actions">
            <button type="submit">{isEdit ? 'Update' : 'Create'}</button>
            <button type="button" onClick={onClose}>Cancel</button>
          </div>
        </form>
    </div>
  );

  if (embedded) {
    return <div className="mobile-page add-task-page">{formContent}</div>;
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      {formContent}
    </div>
  );
}
