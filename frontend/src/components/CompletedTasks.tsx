import { useState, useEffect } from 'react';
import { getCompletedTasks } from '../api';
import { RotateCcw, Trash2 } from 'lucide-react';
import type { Task } from '../types';
import ConfirmModal from './ConfirmModal';

interface Props {
  onClose: () => void;
  onComplete: (id: number) => void;
  onDelete: (id: number, cascade: boolean) => void;
  /** When true, render as page content without modal overlay (for mobile) */
  embedded?: boolean;
}

export default function CompletedTasks({ onClose, onComplete, onDelete, embedded = false }: Props) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [deleteConfirmTask, setDeleteConfirmTask] = useState<Task | null>(null);

  useEffect(() => {
    getCompletedTasks().then(setTasks);
  }, []);

  function handleUncomplete(id: number) {
    onComplete(id);
    setTasks((t) => t.filter((x) => x.id !== id));
  }

  function handleConfirmDelete() {
    if (deleteConfirmTask) {
      onDelete(deleteConfirmTask.id, true);
      setTasks((t) => t.filter((x) => x.id !== deleteConfirmTask.id));
      setDeleteConfirmTask(null);
    }
  }

  const content = (
    <>
      <div className={embedded ? 'completed-content-embedded' : 'modal completed-modal'} onClick={embedded ? undefined : (e: React.MouseEvent) => e.stopPropagation()}>
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
                    <span>Uncomplete</span>
                  </button>
                  <button
                    className="btn-sm"
                    onClick={() => setDeleteConfirmTask(t)}
                    title="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
        {!embedded && <button className="btn-sm" onClick={onClose}>Close</button>}
      </div>

      {deleteConfirmTask && (
        <ConfirmModal
          title="Delete task"
          message={
            <>
              Delete <strong>{deleteConfirmTask.name}</strong>? This cannot be undone.
            </>
          }
          confirmLabel="Delete"
          cancelLabel="Cancel"
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleteConfirmTask(null)}
          variant="danger"
        />
      )}
    </>
  );

  if (embedded) {
    return (
      <div className="mobile-page completed-page">
        {content}
      </div>
    );
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      {content}
    </div>
  );
}
