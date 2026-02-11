import { useState, useEffect, useCallback } from 'react';
import * as api from '../api';
import type { Category, Project, Task } from '../types';
import GanttChart from './GanttChart';
import TaskForm from './TaskForm';
import SplitTaskModal from './SplitTaskModal';
import CompletedTasks from './CompletedTasks';
import CategoryProjectForm from './CategoryProjectForm';
import './MainView.css';

interface Props {
  authEnabled?: boolean;
  onLogout?: () => void;
}

export default function MainView({ authEnabled, onLogout }: Props) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [showAddTask, setShowAddTask] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showCatProj, setShowCatProj] = useState(false);
  const [splitTask, setSplitTask] = useState<Task | null>(null);
  const [includeCompleted, setIncludeCompleted] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const load = useCallback(async () => {
    const [cats, projs, t] = await Promise.all([
      api.getCategories(),
      api.getProjects(),
      api.getTasks(includeCompleted),
    ]);
    setCategories(cats);
    setProjects(projs);
    setTasks(t);
  }, [includeCompleted]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreateCategory(name: string) {
    await api.createCategory(name);
    load();
  }

  async function handleCreateProject(name: string, categoryId: number) {
    await api.createProject(name, categoryId);
    load();
  }

  async function handleCreateTask(data: Parameters<typeof api.createTask>[0]) {
    await api.createTask(data);
    load();
    setShowAddTask(false);
  }

  async function handleUpdateTask(id: number, data: Parameters<typeof api.updateTask>[1]) {
    await api.updateTask(id, data);
    load();
  }

  async function handleDeleteTask(id: number, cascade: boolean) {
    await api.deleteTask(id, cascade);
    load();
  }

  async function handleSplitTask(id: number, subtasks: { name: string; start_date: string; end_date: string }[]) {
    await api.splitTask(id, subtasks);
    load();
    setSplitTask(null);
  }

  async function handleClearAll() {
    if (!confirm('Delete all tasks, projects, and categories? This cannot be undone.')) return;
    await api.clearAllData();
    load();
    setShowSettings(false);
  }

  return (
    <div className="main-view">
      <header className="main-header">
        <button
          className="sidebar-toggle"
          onClick={() => setSidebarCollapsed((c) => !c)}
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {sidebarCollapsed ? '→' : '←'}
        </button>
        <h1>Gantt Chart</h1>
        <div className="header-actions">
          <button
            className="btn-sm"
            onClick={() => setShowAddTask(true)}
            disabled={projects.length === 0}
            title={projects.length === 0 ? 'Add a project first' : ''}
          >
            + Task
          </button>
          <button className="btn-sm" onClick={() => setShowCompleted(true)}>Completed</button>
          <button className="btn-sm" onClick={() => setShowSettings(true)}>Settings</button>
          {authEnabled && onLogout && (
            <button className="btn-sm" onClick={onLogout}>Logout</button>
          )}
        </div>
      </header>

      <div className="main-body">
        {!sidebarCollapsed && (
          <aside className="sidebar">
            <section className="sidebar-section">
              <h3>Categories</h3>
              {categories.length === 0 && <p className="muted" style={{ fontSize: 11 }}>No categories yet</p>}
              {categories.map((c) => (
                <div key={c.id} className="cat-item">
                  <span>{c.name}</span>
                  {projects.filter((p) => p.category_id === c.id).map((p) => (
                    <div key={p.id} className="proj-item">{p.name}</div>
                  ))}
                </div>
              ))}
              <button className="btn-link" onClick={() => setShowCatProj(true)}>
                + Category / Project
              </button>
            </section>
          </aside>
        )}

        <main className="gantt-area">
          <label className="filter-row">
            <input
              type="checkbox"
              checked={includeCompleted}
              onChange={(e) => setIncludeCompleted(e.target.checked)}
            />
            Show completed in chart
          </label>
          <GanttChart
            tasks={tasks}
            projects={projects}
            categories={categories}
            onTaskChange={handleUpdateTask}
            onTaskComplete={(id) => handleUpdateTask(id, { completed: true })}
            onTaskDelete={handleDeleteTask}
            onTaskSplit={setSplitTask}
          />
        </main>
      </div>

      {showAddTask && (
        <TaskForm
          projects={projects}
          onClose={() => setShowAddTask(false)}
          onCreate={handleCreateTask}
        />
      )}

      {splitTask && (
        <SplitTaskModal
          task={splitTask}
          onClose={() => setSplitTask(null)}
          onSplit={handleSplitTask}
        />
      )}

      {showCompleted && (
        <CompletedTasks
          onClose={() => setShowCompleted(false)}
          onComplete={(id) => handleUpdateTask(id, { completed: false })}
          onDelete={handleDeleteTask}
        />
      )}

      {showCatProj && (
        <CategoryProjectForm
          categories={categories}
          onAddCategory={handleCreateCategory}
          onAddProject={handleCreateProject}
          onClose={() => setShowCatProj(false)}
        />
      )}

      {showSettings && (
        <div className="modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Settings</h3>
            <button className="btn-danger" onClick={handleClearAll}>Clear all data</button>
            <button className="btn-sm" onClick={() => setShowSettings(false)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
