import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Pencil, Trash2, CheckSquare, Settings } from 'lucide-react';
import * as api from '../api';
import type { Category, Project, Task } from '../types';
import GanttChart from './GanttChart';
import TaskForm from './TaskForm';
import SplitTaskModal from './SplitTaskModal';
import CompletedTasks from './CompletedTasks';
import CategoryProjectForm from './CategoryProjectForm';
import ClearAllConfirmModal from './ClearAllConfirmModal';
import ConfirmModal from './ConfirmModal';
import { useMediaQuery } from '../hooks/useMediaQuery';
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
  const [showClearAllConfirm, setShowClearAllConfirm] = useState(false);
  const [deleteCategoryConfirm, setDeleteCategoryConfirm] = useState<Category | null>(null);
  const [deleteProjectConfirm, setDeleteProjectConfirm] = useState<Project | null>(null);
  const [restoreConfirmData, setRestoreConfirmData] = useState<Record<string, unknown> | null>(null);
  const { isMobile } = useMediaQuery();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= 768
  );

  const isSidebarOverlay = isMobile && !sidebarCollapsed;

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
    await api.clearAllData();
    await load();
    setShowSettings(false);
    setShowClearAllConfirm(false);
  }

  async function handleDownloadBackup() {
    try {
      const blob = await api.downloadBackup();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gantt-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to download backup');
    }
  }

  function handleRestoreFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string) as Record<string, unknown>;
        if (!Array.isArray(data.categories) || !Array.isArray(data.projects) || !Array.isArray(data.tasks)) {
          alert('Invalid backup file');
          return;
        }
        setRestoreConfirmData(data);
      } catch {
        alert('Invalid backup file');
      }
    };
    reader.readAsText(file);
  }

  async function handleConfirmRestore() {
    if (!restoreConfirmData) return;
    try {
      await api.restoreBackup(restoreConfirmData);
      await load();
      setRestoreConfirmData(null);
      setShowSettings(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to restore backup');
    }
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
            title={projects.length === 0 ? 'Add a project first' : 'Add task'}
            aria-label={projects.length === 0 ? 'Add a project first' : 'Add task'}
          >
            + Task
          </button>
          <button
            className="btn-sm btn-sm-completed"
            onClick={() => setShowCompleted(true)}
            title="Completed tasks"
            aria-label="Completed tasks"
          >
            <CheckSquare size={16} />
            <span className="btn-sm-label">Completed</span>
          </button>
          <button
            className="btn-sm btn-sm-settings"
            onClick={() => setShowSettings(true)}
            title="Settings"
            aria-label="Settings"
          >
            <Settings size={16} />
            <span className="btn-sm-label">Settings</span>
          </button>
          {authEnabled && onLogout && (
            <button className="btn-sm" onClick={onLogout} aria-label="Logout">
              Logout
            </button>
          )}
        </div>
      </header>

      <div className="main-body">
        {isSidebarOverlay && (
          <div
            className="sidebar-backdrop"
            onClick={() => setSidebarCollapsed(true)}
            aria-hidden="true"
          />
        )}
        {!sidebarCollapsed && (
          <aside
            className={`sidebar ${isSidebarOverlay ? 'sidebar-overlay' : ''}`}
            aria-label="Categories and projects"
          >
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
                      onClick={() => setDeleteCategoryConfirm(c)}
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
                          setDeleteProjectConfirm(p);
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
            onTaskUncomplete={(id) => handleUpdateTask(id, { completed: false })}
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
            <div className="settings-section">
              <h4>Backup</h4>
              <div className="settings-actions">
                <button className="btn-sm" onClick={handleDownloadBackup}>
                  Download backup
                </button>
                <label className="btn-sm btn-sm-restore">
                  Restore backup
                  <input
                    type="file"
                    accept=".json,application/json"
                    onChange={handleRestoreFileSelect}
                    style={{ display: 'none' }}
                  />
                </label>
              </div>
            </div>
            <div className="settings-section">
              <h4>Danger zone</h4>
              <button
                className="btn-danger"
                onClick={() => setShowClearAllConfirm(true)}
              >
                Clear all data
              </button>
            </div>
            <button className="btn-sm" onClick={() => setShowSettings(false)}>Close</button>
          </div>
        </div>
      )}

      {restoreConfirmData && (
        <ConfirmModal
          title="Restore backup"
          message="This will replace all current data with the backup. This cannot be undone. Continue?"
          confirmLabel="Restore"
          cancelLabel="Cancel"
          onConfirm={handleConfirmRestore}
          onCancel={() => setRestoreConfirmData(null)}
          variant="danger"
        />
      )}

      {showClearAllConfirm && (
        <ClearAllConfirmModal
          onConfirm={handleClearAll}
          onCancel={() => setShowClearAllConfirm(false)}
        />
      )}

      {deleteCategoryConfirm && (
        <ConfirmModal
          title="Delete category"
          message={
            <>
              Delete <strong>{deleteCategoryConfirm.name}</strong> and all its projects and tasks? This cannot be undone.
            </>
          }
          confirmLabel="Delete"
          cancelLabel="Cancel"
          onConfirm={() => {
            handleDeleteCategory(deleteCategoryConfirm.id);
            setDeleteCategoryConfirm(null);
          }}
          onCancel={() => setDeleteCategoryConfirm(null)}
          variant="danger"
        />
      )}

      {deleteProjectConfirm && (
        <ConfirmModal
          title="Delete project"
          message={
            <>
              Delete <strong>{deleteProjectConfirm.name}</strong> and all its tasks? This cannot be undone.
            </>
          }
          confirmLabel="Delete"
          cancelLabel="Cancel"
          onConfirm={() => {
            handleDeleteProject(deleteProjectConfirm.id);
            setDeleteProjectConfirm(null);
          }}
          onCancel={() => setDeleteProjectConfirm(null)}
          variant="danger"
        />
      )}
    </div>
  );
}
