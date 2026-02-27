import { BarChart2, List, FolderOpen, Plus, CheckSquare } from 'lucide-react';
import './BottomNav.css';

export type MobilePage = 'chart' | 'list' | 'categories' | 'add-task' | 'completed' | 'settings';

interface Props {
  currentPage: MobilePage;
  onPageChange: (page: MobilePage) => void;
  projectsLength: number;
}

export default function BottomNav({
  currentPage,
  onPageChange,
  projectsLength,
}: Props) {
  return (
    <nav className="bottom-nav bottom-nav-5" aria-label="Main navigation">
      <button
        type="button"
        className={`bottom-nav-item ${currentPage === 'chart' ? 'active' : ''}`}
        onClick={() => onPageChange('chart')}
        title="Chart"
        aria-label="Chart"
      >
        <BarChart2 size={18} />
        <span className="bottom-nav-label">Chart</span>
      </button>
      <button
        type="button"
        className={`bottom-nav-item ${currentPage === 'list' ? 'active' : ''}`}
        onClick={() => onPageChange('list')}
        title="List"
        aria-label="List"
      >
        <List size={18} />
        <span className="bottom-nav-label">List</span>
      </button>
      <button
        type="button"
        className={`bottom-nav-item bottom-nav-add ${currentPage === 'add-task' ? 'active' : ''}`}
        onClick={() => onPageChange('add-task')}
        disabled={projectsLength === 0}
        title={projectsLength === 0 ? 'Click Categories to add a category and project first' : 'Add task'}
        aria-label={projectsLength === 0 ? 'Click Categories to add a category and project first' : 'Add task'}
      >
        <Plus size={20} strokeWidth={2.5} />
        <span className="bottom-nav-label">Task</span>
      </button>
      <button
        type="button"
        className={`bottom-nav-item ${currentPage === 'completed' ? 'active' : ''}`}
        onClick={() => onPageChange('completed')}
        title="Completed tasks"
        aria-label="Completed tasks"
      >
        <CheckSquare size={18} />
        <span className="bottom-nav-label">Done</span>
      </button>
      <button
        type="button"
        className={`bottom-nav-item ${currentPage === 'categories' ? 'active' : ''}`}
        onClick={() => onPageChange('categories')}
        title="Categories"
        aria-label="Categories"
      >
        <FolderOpen size={18} />
        <span className="bottom-nav-label">Categories</span>
      </button>
    </nav>
  );
}
