import { useState, useEffect } from 'react';
import type { Project, Task } from '../types';
import type { updateTask } from '../api';

interface Props {
  projects: Project[];
  task?: Task | null;
  onClose: () => void;
  onCreate: (data: {
    project_id: number;
    name: string;
    start_date: string;
    end_date: string;
    due_date?: string;
    base_priority?: number;
  }) => void;
  onUpdate?: (id: number, data: Parameters<typeof updateTask>[1]) => void;
}

export default function TaskForm({ projects, task, onClose, onCreate, onUpdate }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const isEdit = !!task;
  const [projectId, setProjectId] = useState(projects[0]?.id || 0);
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [dueDate, setDueDate] = useState('');
  const [basePriority, setBasePriority] = useState(5);

  useEffect(() => {
    if (task) {
      setProjectId(task.project_id);
      setName(task.name);
      setStartDate(task.start_date.slice(0, 10));
      setEndDate(task.end_date.slice(0, 10));
      setDueDate(task.due_date?.slice(0, 10) ?? '');
      setBasePriority(task.base_priority ?? 5);
    }
  }, [task]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId || !name || !startDate || !endDate) return;
    if (isEdit && task && onUpdate) {
      onUpdate(task.id, {
        name,
        start_date: startDate,
        end_date: endDate,
        due_date: dueDate || undefined,
        base_priority: basePriority,
      });
    } else {
      onCreate({
        project_id: projectId,
        name,
        start_date: startDate,
        end_date: endDate,
        due_date: dueDate || undefined,
        base_priority: basePriority,
      });
    }
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal task-form" onClick={(e) => e.stopPropagation()}>
        <h3>{isEdit ? 'Edit Task' : 'New Task'}</h3>
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <label>Project</label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(Number(e.target.value))}
              required
              disabled={isEdit}
              title={isEdit ? 'Project cannot be changed when editing' : undefined}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
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
              onChange={(e) => setStartDate(e.target.value)}
              required
            />
          </div>
          <div className="form-row">
            <label>End</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              required
            />
          </div>
          <div className="form-row">
            <label>Due (optional)</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
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
          <div className="form-actions">
            <button type="submit">{isEdit ? 'Update' : 'Create'}</button>
            <button type="button" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}
