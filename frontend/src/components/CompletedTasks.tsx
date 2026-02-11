import { useState, useEffect } from 'react';
import { getCompletedTasks } from '../api';
import { RotateCcw, Trash2 } from 'lucide-react';
import type { Task } from '../types';

interface Props {
  onClose: () => void;
  onComplete: (id: number) => void;
  onDelete: (id: number, cascade: boolean) => void;
}

export default function CompletedTasks({ onClose, onComplete, onDelete }: Props) {
  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => {
    getCompletedTasks().then(setTasks);
  }, []);

  function handleUncomplete(id: number) {
    onComplete(id);
    setTasks((t) => t.filter((x) => x.id !== id));
  }

  function handleDelete(id: number) {
    onDelete(id, true);
    setTasks((t) => t.filter((x) => x.id !== id));
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal completed-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Completed Tasks</h3>
        <div className="completed-list">
          {tasks.length === 0 ? (
            <p className="muted">No completed tasks</p>
          ) : (
            tasks.map((t) => (
              <div key={t.id} className="completed-item">
                <span>{t.name}</span>
                <span className="muted">{t.project_name} · {t.completed_at?.slice(0, 10)}</span>
                <div className="item-actions">
                  <button
                    className="btn-sm"
                    onClick={() => handleUncomplete(t.id)}
                    title="Mark incomplete"
                  >
                    <RotateCcw size={14} />
                  </button>
                  <button
                    className="btn-sm"
                    onClick={() => handleDelete(t.id)}
                    title="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
        <button className="btn-sm" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
