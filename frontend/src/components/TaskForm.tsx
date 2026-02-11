import { useState } from 'react';
import type { Project } from '../types';

interface Props {
  projects: Project[];
  onClose: () => void;
  onCreate: (data: {
    project_id: number;
    name: string;
    start_date: string;
    end_date: string;
    due_date?: string;
    base_priority?: number;
  }) => void;
}

export default function TaskForm({ projects, onClose, onCreate }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [projectId, setProjectId] = useState(projects[0]?.id || 0);
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [dueDate, setDueDate] = useState('');
  const [basePriority, setBasePriority] = useState(5);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId || !name || !startDate || !endDate) return;
    onCreate({
      project_id: projectId,
      name,
      start_date: startDate,
      end_date: endDate,
      due_date: dueDate || undefined,
      base_priority: basePriority,
    });
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal task-form" onClick={(e) => e.stopPropagation()}>
        <h3>New Task</h3>
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <label>Project</label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(Number(e.target.value))}
              required
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
            <label>Priority (1-10)</label>
            <input
              type="number"
              min={1}
              max={10}
              value={basePriority}
              onChange={(e) => setBasePriority(Number(e.target.value))}
            />
          </div>
          <div className="form-actions">
            <button type="submit">Create</button>
            <button type="button" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}
