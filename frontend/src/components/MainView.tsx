import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Pencil, Trash2 } from 'lucide-react';
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
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [editCategory, setEditCategory] = useState<Category | null>(null);
  const [editProject, setEditProject] = useState<Project | null>(null);
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
    await load();
  }

  async function handleCreateProject(name: string, categoryId: number, dueDate?: string, startDate?: string) {
    await api.createProject(name, categoryId, dueDate, startDate);
    await load();
  }

  async function handleDeleteCategory(id: number) {
    await api.deleteCategory(id);
    await load();
  }

  async function handleDeleteProject(id: number) {
    await api.deleteProject(id);
    await load();
  }

  async function handleUpdateCategory(id: number, name: string) {
    await api.updateCategory(id, { name });
    await load();
  }

  async function handleUpdateProject(
    id: number,
    name: string,
    categoryId: number,
    dueDate?: string | null,
    startDate?: string | null
  ) {
    await api.updateProject(id, {
      name,
      category_id: categoryId,
      due_date: dueDate ?? undefined,
      start_date: startDate ?? undefined,
    });
    await load();
  }

  async function handleCreateTask(data: Parameters<typeof api.createTask>[0]) {
    await api.createTask(data);
    await load();
    setShowAddTask(false);
  }

  async function handleUpdateTask(id: number, data: Parameters<typeof api.updateTask>[1]) {
    await api.updateTask(id, data);
    await load();
  }

  async function handleDeleteTask(id: number, cascade: boolean) {
    await api.deleteTask(id, cascade);
    await load();
  }

  async function handleSplitTask(id: number, subtasks: { name: string; start_date: string; end_date: string }[]) {
    await api.splitTask(id, subtasks);
    await load();
    setSplitTask(null);
  }

  async function handleClearAll() {
    if (!confirm('Delete all tasks, projects, and categories? This cannot be undone.')) return;
    await api.clearAllData();
    await load();
    setShowSettings(false);
  }

  return (
    <div className="main-view">
      <header className="main-header">
        <button
          className="sidebar-toggle"
          onClick={() => setSidebarCollapsed((c) => !c)}
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
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
                <div key={c.id} className="cat-block">
                  <div className="cat-item">
                    <span className="cat-name">{c.name}</span>
                    <button
                      type="button"
                      className="sidebar-edit"
                      onClick={() => { setEditCategory(c); setEditProject(null); setShowCatProj(true); }}
                      title="Edit category"
                      aria-label="Edit category"
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      type="button"
                      className="sidebar-delete"
                      onClick={() => {
                        if (confirm(`Delete "${c.name}" and all its projects and tasks?`)) handleDeleteCategory(c.id);
                      }}
                      title="Delete category"
                      aria-label="Delete category"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                  {projects.filter((p) => p.category_id === c.id).map((p) => (
                    <div key={p.id} className="proj-item">
                      <span>{p.name}</span>
                      <button
                        type="button"
                        className="sidebar-edit"
                        onClick={(e) => { e.stopPropagation(); setEditProject(p); setEditCategory(null); setShowCatProj(true); }}
                        title="Edit project"
                        aria-label="Edit project"
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        type="button"
                        className="sidebar-delete"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Delete "${p.name}" and all its tasks?`)) handleDeleteProject(p.id);
                        }}
                        title="Delete project"
                        aria-label="Delete project"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              ))}
              <button className="btn-link" onClick={() => { setEditCategory(null); setEditProject(null); setShowCatProj(true); }}>
                + Category / Project
              </button>
            </section>
          </aside>
        )}

        <main className="gantt-area">
          <GanttChart
            tasks={tasks}
            projects={projects}
            categories={categories}
            includeCompleted={includeCompleted}
            onIncludeCompletedChange={setIncludeCompleted}
            onTaskChange={handleUpdateTask}
            onTaskComplete={(id) => handleUpdateTask(id, { completed: true })}
            onTaskDelete={handleDeleteTask}
            onTaskSplit={setSplitTask}
            onTaskEdit={setEditTask}
          />
        </main>
      </div>

      {(showAddTask || editTask) && (
        <TaskForm
          categories={categories}
          projects={projects}
          task={editTask}
          onClose={() => {
            setShowAddTask(false);
            setEditTask(null);
          }}
          onCreate={handleCreateTask}
          onUpdate={editTask ? handleUpdateTask : undefined}
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
          editingCategory={editCategory}
          editingProject={editProject}
          onAddCategory={handleCreateCategory}
          onAddProject={handleCreateProject}
          onUpdateCategory={handleUpdateCategory}
          onUpdateProject={handleUpdateProject}
          onDeleteCategory={handleDeleteCategory}
          onDeleteProject={handleDeleteProject}
          onClose={() => { setShowCatProj(false); setEditCategory(null); setEditProject(null); }}
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
