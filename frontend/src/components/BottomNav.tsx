import { FolderOpen, Plus, CheckSquare, Settings } from 'lucide-react';
import './BottomNav.css';

interface Props {
  onCategories: () => void;
  onAddTask: () => void;
  onCompleted: () => void;
  onSettings: () => void;
  projectsLength: number;
}

export default function BottomNav({
  onCategories,
  onAddTask,
  onCompleted,
  onSettings,
  projectsLength,
}: Props) {
  return (
    <nav className="bottom-nav" aria-label="Main navigation">
      <button
        type="button"
        className="bottom-nav-item"
        onClick={onCategories}
        title="Categories"
        aria-label="Categories"
      >
        <FolderOpen size={18} />
        <span className="bottom-nav-label">Categories</span>
      </button>
      <button
        type="button"
        className="bottom-nav-item bottom-nav-add"
        onClick={onAddTask}
        disabled={projectsLength === 0}
        title={projectsLength === 0 ? 'Add a project first' : 'Add task'}
        aria-label={projectsLength === 0 ? 'Add a project first' : 'Add task'}
      >
        <Plus size={22} strokeWidth={2.5} />
        <span className="bottom-nav-label">Add Task</span>
      </button>
      <button
        type="button"
        className="bottom-nav-item"
        onClick={onCompleted}
        title="Completed tasks"
        aria-label="Completed tasks"
      >
        <CheckSquare size={18} />
        <span className="bottom-nav-label">Completed</span>
      </button>
      <button
        type="button"
        className="bottom-nav-item"
        onClick={onSettings}
        title="Settings"
        aria-label="Settings"
      >
        <Settings size={18} />
        <span className="bottom-nav-label">Settings</span>
      </button>
    </nav>
  );
}
