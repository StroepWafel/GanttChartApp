import { useState } from 'react';
import { X } from 'lucide-react';
import type { Task } from '../types';
import { useModal } from '../context/ModalContext';

interface Props {
  task: Task;
  onClose: () => void;
  onSplit: (id: number, subtasks: { name: string; start_date: string; end_date: string }[]) => void;
}

export default function SplitTaskModal({ task, onClose, onSplit }: Props) {
  const modal = useModal();
  const [subtasks, setSubtasks] = useState([
    { name: '', start_date: task.start_date, end_date: task.end_date },
    { name: '', start_date: task.start_date, end_date: task.end_date },
  ]);

  function addSubtask() {
    setSubtasks((s) => [
      ...s,
      { name: '', start_date: task.start_date, end_date: task.end_date },
    ]);
  }

  function updateSubtask(i: number, field: 'name' | 'start_date' | 'end_date', value: string) {
    setSubtasks((s) => {
      const n = [...s];
      n[i] = { ...n[i], [field]: value };
      if (field === 'start_date' && n[i].end_date < value) n[i].end_date = value;
      if (field === 'end_date' && n[i].start_date > value) n[i].start_date = value;
      return n;
    });
  }

  function removeSubtask(i: number) {
    setSubtasks((s) => s.filter((_, j) => j !== i));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const valid = subtasks.filter((st) => st.name && st.start_date && st.end_date);
    if (valid.length < 2) {
      modal.showAlert({ title: 'Validation', message: 'Need at least 2 subtasks with names and dates' });
      return;
    }
    const bad = valid.some((st) => st.end_date < st.start_date);
    if (bad) {
      modal.showAlert({ title: 'Validation', message: 'End date cannot be before start date for any subtask' });
      return;
    }
    onSplit(task.id, valid);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal split-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Split: {task.name}</h3>
        <p className="split-desc">Create sub-tasks. The original task will become a parent container.</p>
        <form onSubmit={handleSubmit}>
          {subtasks.map((st, i) => (
            <div key={i} className="subtask-row">
              <input
                type="text"
                placeholder="Subtask name"
                value={st.name}
                onChange={(e) => updateSubtask(i, 'name', e.target.value)}
              />
              <input
                type="date"
                value={st.start_date}
                onChange={(e) => updateSubtask(i, 'start_date', e.target.value)}
              />
              <input
                type="date"
                value={st.end_date}
                min={st.start_date}
                onChange={(e) => updateSubtask(i, 'end_date', e.target.value)}
              />
              <button type="button" onClick={() => removeSubtask(i)} disabled={subtasks.length <= 2} title="Remove subtask">
                <X size={14} />
              </button>
            </div>
          ))}
          <button type="button" onClick={addSubtask} className="btn-link">+ Add subtask</button>
          <div className="form-actions">
            <button type="submit">Split</button>
            <button type="button" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}
