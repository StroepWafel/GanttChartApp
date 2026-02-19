import { useState, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Pencil, Trash2, CheckSquare, Settings, Copy } from 'lucide-react';
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
import {
  loadPriorityColors,
  savePriorityColors,
  DEFAULT_PRIORITY_COLORS,
  type PriorityColors,
} from '../priorityColors';
import { getSettingsForBackup, applySettingsFromBackup, type BackupSettings } from '../settingsBackup';
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
  const [priorityColors, setPriorityColors] = useState<PriorityColors>(() => loadPriorityColors());
  const [showPriorityColors, setShowPriorityColors] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ id: number; username: string; isAdmin: boolean; apiKey: string | null } | null>(null);
  const [users, setUsers] = useState<{ id: number; username: string; isAdmin: boolean; isActive: boolean; apiKey: string | null }[]>([]);
  const [showUserManagement, setShowUserManagement] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newTempPassword, setNewTempPassword] = useState('');
  const [changePasswordCurrent, setChangePasswordCurrent] = useState('');
  const [changePasswordNew, setChangePasswordNew] = useState('');
  const [masqueradeUserId, setMasqueradeUserId] = useState<string>('');
  const [userMgmtError, setUserMgmtError] = useState('');
  const [autoUpdateEnabled, setAutoUpdateEnabled] = useState(false);
  const [updateCheck, setUpdateCheck] = useState<{
    updateAvailable: boolean;
    currentVersion?: string;
    latestVersion?: string;
    releaseUrl?: string;
    error?: string;
    _debug?: Record<string, unknown>;
  } | null>(null);
  const [showUpdateDebug, setShowUpdateDebug] = useState(false);
  const [applyingUpdate, setApplyingUpdate] = useState(false);
  const [appVersion, setAppVersion] = useState<string | null>(null);
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

  useEffect(() => {
    if (authEnabled) {
      api.getMe()
        .then((u) => setCurrentUser({ id: u.id, username: u.username, isAdmin: u.isAdmin, apiKey: u.apiKey ?? null }))
        .catch(() => setCurrentUser(null));
    } else {
      setCurrentUser(null);
    }
  }, [authEnabled]);

  useEffect(() => {
    if (authEnabled && currentUser?.isAdmin) {
      api.getUsers().then(setUsers).catch(() => setUsers([]));
    }
  }, [authEnabled, currentUser?.isAdmin]);

  useEffect(() => {
    if (authEnabled && currentUser?.isAdmin) {
      api.getSettings()
        .then((s) => setAutoUpdateEnabled(!!s.auto_update_enabled))
        .catch(() => {});
    }
  }, [authEnabled, currentUser?.isAdmin]);

  useEffect(() => {
    api.getVersion().then((v) => setAppVersion(v.version)).catch(() => {});
  }, []);

  useEffect(() => {
    if (authEnabled) {
      api.getUserPreferences()
        .then((prefs) => {
          const pc = prefs.priority_colors ?? prefs.priorityColors;
          if (pc && typeof pc === 'object') {
            const valid: PriorityColors = {};
            for (let p = 1; p <= 10; p++) {
              const v = (pc as Record<number, { bg?: string; progress?: string }>)[p];
              if (v?.bg && v?.progress) valid[p] = { bg: v.bg, progress: v.progress };
            }
            if (Object.keys(valid).length > 0) {
              setPriorityColors((prev) => ({ ...DEFAULT_PRIORITY_COLORS, ...prev, ...valid }));
            }
          }
        })
        .catch(() => {});
    }
  }, [authEnabled]);

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
      const data = await api.getBackupData();
      data.settings = getSettingsForBackup();
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json',
      });
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

  function handlePriorityColorChange(priorities: number[], field: 'bg' | 'progress', value: string) {
    setPriorityColors((prev) => {
      const next = { ...prev };
      for (const p of priorities) {
        next[p] = { ...(next[p] ?? DEFAULT_PRIORITY_COLORS[p]), [field]: value };
      }
      savePriorityColors(next);
      if (authEnabled) {
        api.patchUserPreferences('priority_colors', next).catch(() => {});
      }
      return next;
    });
  }

  function handleResetPriorityColors() {
    setPriorityColors({ ...DEFAULT_PRIORITY_COLORS });
    savePriorityColors(DEFAULT_PRIORITY_COLORS);
    if (authEnabled) {
      api.patchUserPreferences('priority_colors', DEFAULT_PRIORITY_COLORS).catch(() => {});
    }
  }

  async function handleConfirmRestore() {
    if (!restoreConfirmData) return;
    try {
      await api.restoreBackup(restoreConfirmData);
      applySettingsFromBackup(restoreConfirmData.settings as BackupSettings | undefined);
      const colors = loadPriorityColors();
      setPriorityColors(() => colors);
      if (authEnabled) {
        await api.patchUserPreferences('priority_colors', colors);
      }
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
            priorityColors={priorityColors}
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
          <div className="modal settings-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Settings</h3>
            {authEnabled && currentUser && (
              <div className="settings-section">
                <h4>Account</h4>
                <p className="settings-desc">Signed in as <strong>{currentUser.username}</strong></p>
                <div className="settings-section">
                  <h5>Change password</h5>
                  <div className="change-password-form">
                    <input
                      type="password"
                      placeholder="Current password"
                      value={changePasswordCurrent}
                      onChange={(e) => setChangePasswordCurrent(e.target.value)}
                      className="settings-input"
                    />
                    <input
                      type="password"
                      placeholder="New password"
                      value={changePasswordNew}
                      onChange={(e) => setChangePasswordNew(e.target.value)}
                      className="settings-input"
                    />
                    <button
                      type="button"
                      className="btn-sm"
                      onClick={async () => {
                        if (!changePasswordCurrent || !changePasswordNew) return;
                        try {
                          await api.changePassword(changePasswordCurrent, changePasswordNew);
                          setChangePasswordCurrent('');
                          setChangePasswordNew('');
                        } catch (err) {
                          alert(err instanceof Error ? err.message : 'Failed to change password');
                        }
                      }}
                    >
                      Change password
                    </button>
                  </div>
                </div>
                <div className="settings-section">
                  <h5>API key</h5>
                  <p className="settings-desc">Use with X-API-Username and X-API-Key for read-only IoT API.</p>
                  {currentUser.apiKey ? (
                    <div className="api-key-row">
                      <code className="api-key-value">{currentUser.apiKey}</code>
                      <button
                        type="button"
                        className="btn-sm"
                        title="Copy API key"
                        aria-label="Copy API key"
                        onClick={() => {
                          navigator.clipboard.writeText(currentUser.apiKey!);
                        }}
                      >
                        <Copy size={16} />
                      </button>
                    </div>
                  ) : (
                    <p className="muted">No API key</p>
                  )}
                </div>
              </div>
            )}
            {authEnabled && currentUser?.isAdmin && (
              <div className="settings-section">
                <h4>Admin</h4>
                <div className="settings-section settings-dropdown">
                  <button
                    type="button"
                    className={`settings-dropdown-trigger ${showUserManagement ? 'expanded' : ''}`}
                    onClick={() => setShowUserManagement((v) => !v)}
                    aria-expanded={showUserManagement}
                  >
                    <span>User management</span>
                    <ChevronDown size={16} className={showUserManagement ? 'rotated' : ''} />
                  </button>
                  {showUserManagement && (
                    <div className="settings-dropdown-content">
                      <div className="user-list">
                        {users.map((u) => (
                          <div key={u.id} className="user-row user-row-admin">
                            <span className="user-row-name">
                              {u.username}
                              {u.isAdmin && <span className="admin-badge">Admin</span>}
                              {!u.isActive && <span className="inactive-badge">Disabled</span>}
                            </span>
                            {u.id !== currentUser?.id && (
                              <div className="user-row-actions">
                                <button
                                  type="button"
                                  className="btn-sm btn-sm-danger-outline"
                                  title={u.isActive ? 'Revoke account access' : 'Restore account access'}
                                  onClick={async () => {
                                    try {
                                      await api.updateUser(u.id, { isActive: !u.isActive });
                                      api.getUsers().then(setUsers);
                                    } catch (err) {
                                      alert(err instanceof Error ? err.message : 'Failed to update user');
                                    }
                                  }}
                                >
                                  {u.isActive ? 'Revoke account' : 'Restore account'}
                                </button>
                                <button
                                  type="button"
                                  className="btn-sm btn-sm-danger-outline"
                                  title="Revoke API key"
                                  disabled={!u.apiKey}
                                  onClick={async () => {
                                    if (!u.apiKey) return;
                                    if (!confirm(`Revoke API key for ${u.username}? They will need a new key to use the IoT API.`)) return;
                                    try {
                                      await api.updateUser(u.id, { revokeApiKey: true });
                                      api.getUsers().then(setUsers);
                                    } catch (err) {
                                      alert(err instanceof Error ? err.message : 'Failed to revoke API key');
                                    }
                                  }}
                                >
                                  Revoke API key
                                </button>
                                <button
                                  type="button"
                                  className="btn-sm"
                                  title="Generate new API key"
                                  onClick={async () => {
                                    try {
                                      await api.updateUser(u.id, { regenerateApiKey: true });
                                      api.getUsers().then(setUsers);
                                    } catch (err) {
                                      alert(err instanceof Error ? err.message : 'Failed to regenerate API key');
                                    }
                                  }}
                                >
                                  New API key
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                      <div className="create-user-form">
                        <input
                          type="text"
                          placeholder="Username"
                          value={newUsername}
                          onChange={(e) => setNewUsername(e.target.value)}
                          className="settings-input"
                        />
                        <input
                          type="password"
                          placeholder="Temporary password"
                          value={newTempPassword}
                          onChange={(e) => setNewTempPassword(e.target.value)}
                          className="settings-input"
                        />
                        <button
                          type="button"
                          className="btn-sm"
                          onClick={async () => {
                            if (!newUsername || !newTempPassword) return;
                            setUserMgmtError('');
                            try {
                              await api.createUser(newUsername, newTempPassword);
                              setNewUsername('');
                              setNewTempPassword('');
                              api.getUsers().then(setUsers);
                            } catch (err) {
                              setUserMgmtError(err instanceof Error ? err.message : 'Failed to create user');
                            }
                          }}
                        >
                          Create user
                        </button>
                      </div>
                      {userMgmtError && <p className="auth-error">{userMgmtError}</p>}
                    </div>
                  )}
                </div>
                <div className="settings-section">
                  <h5>Masquerade</h5>
                  <p className="settings-desc">Act as another user.</p>
                  <div className="masquerade-row">
                    <select
                      value={masqueradeUserId}
                      onChange={(e) => setMasqueradeUserId(e.target.value)}
                      className="settings-select"
                    >
                      <option value="">Select user...</option>
                      {users.filter((u) => u.id !== currentUser?.id).map((u) => (
                        <option key={u.id} value={String(u.id)}>{u.username}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn-sm"
                      disabled={!masqueradeUserId}
                      onClick={async () => {
                        if (!masqueradeUserId) return;
                        try {
                          await api.masquerade(parseInt(masqueradeUserId, 10));
                          setMasqueradeUserId('');
                          window.location.reload();
                        } catch (err) {
                          alert(err instanceof Error ? err.message : 'Masquerade failed');
                        }
                      }}
                    >
                      Masquerade
                    </button>
                  </div>
                </div>
                <div className="settings-section">
                  <h5>Full backup</h5>
                  <p className="settings-desc">Download backup of all users and data (admin only).</p>
                  <button
                    type="button"
                    className="btn-sm"
                    onClick={async () => {
                      try {
                        const blob = await api.getAdminFullBackup();
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `gantt-full-backup-${new Date().toISOString().slice(0, 10)}.json`;
                        a.click();
                        URL.revokeObjectURL(url);
                      } catch (err) {
                        alert(err instanceof Error ? err.message : 'Failed to download full backup');
                      }
                    }}
                  >
                    Download full backup
                  </button>
                </div>
                <div className="settings-section">
                  <h5>Updates</h5>
                  <p className="settings-desc settings-version">
                    Version v{appVersion ?? '…'} <span title="Frontend build applied">✓ Success</span>
                  </p>
                  <p className="settings-desc">
                    Automatic restarts after update only work when deployed with PM2.
                    Update scripts log to <code>data/backups/update.log</code>.
                  </p>
                  <div className="settings-checkbox-row">
                    <label>
                      <input
                        type="checkbox"
                        checked={autoUpdateEnabled}
                        onChange={async (e) => {
                          const v = e.target.checked;
                          setAutoUpdateEnabled(v);
                          try {
                            await api.patchSettings({ auto_update_enabled: v });
                          } catch (err) {
                            setAutoUpdateEnabled(!v);
                            alert(err instanceof Error ? err.message : 'Failed to save');
                          }
                        }}
                      />
                      Enable automatic update checks
                    </label>
                  </div>
                  <div className="update-actions">
                    <button
                      type="button"
                      className="btn-sm"
                      onClick={async () => {
                        setUpdateCheck(null);
                        try {
                          const data = await api.checkUpdate(false);
                          setUpdateCheck(data);
                        } catch (err) {
                          setUpdateCheck({ updateAvailable: false, error: err instanceof Error ? err.message : 'Check failed' });
                        }
                      }}
                    >
                      Check for updates
                    </button>
                    <button
                      type="button"
                      className="btn-sm"
                      title="Include debug info (paths, version source) for troubleshooting"
                      onClick={async () => {
                        setUpdateCheck(null);
                        try {
                          const data = await api.checkUpdate(true);
                          setUpdateCheck(data);
                          setShowUpdateDebug(true);
                        } catch (err) {
                          setUpdateCheck({ updateAvailable: false, error: err instanceof Error ? err.message : 'Check failed' });
                        }
                      }}
                    >
                      Check with debug
                    </button>
                    {updateCheck?.updateAvailable && (
                      <button
                        type="button"
                        className="btn-sm"
                        disabled={applyingUpdate}
                        onClick={async () => {
                          if (!confirm(`Update to v${updateCheck.latestVersion}? A full backup will be created first. The app will restart (PM2 only).`)) return;
                          setApplyingUpdate(true);
                          try {
                            await api.applyUpdate();
                            alert('Backup created. Update in progress. The page will reload when the update completes.');
                            setTimeout(() => window.location.reload(), 3000);
                          } catch (err) {
                            setApplyingUpdate(false);
                            alert(err instanceof Error ? err.message : 'Failed to apply update');
                          }
                        }}
                      >
                        {applyingUpdate ? 'Applying…' : `Apply update (v${updateCheck.latestVersion})`}
                      </button>
                    )}
                  </div>
                  {updateCheck && (
                    <>
                      <p className="settings-desc">
                        {updateCheck.updateAvailable ? (
                          <>Update available: v{updateCheck.latestVersion} (current: v{updateCheck.currentVersion})</>
                        ) : updateCheck.error ? (
                          <span className="auth-error">{updateCheck.error}</span>
                        ) : (
                          <>Up to date (v{updateCheck.currentVersion})</>
                        )}
                      </p>
                      {updateCheck._debug && (
                        <div className="update-debug">
                          <button
                            type="button"
                            className="btn-sm"
                            onClick={() => setShowUpdateDebug((v) => !v)}
                          >
                            {showUpdateDebug ? 'Hide' : 'Show'} debug info
                          </button>
                          {showUpdateDebug && (
                            <pre className="update-debug-content" title="Copy this to share when reporting issues">
                              {JSON.stringify(updateCheck._debug, null, 2)}
                            </pre>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
            <div className="settings-section settings-dropdown">
              <button
                type="button"
                className={`settings-dropdown-trigger ${showPriorityColors ? 'expanded' : ''}`}
                onClick={() => setShowPriorityColors((v) => !v)}
                aria-expanded={showPriorityColors}
              >
                <span>Priority colors</span>
                <ChevronDown size={16} className={showPriorityColors ? 'rotated' : ''} />
              </button>
              {showPriorityColors && (
                <div className="settings-dropdown-content">
                  <p className="settings-desc">Customize colors for each priority level (1 low → 10 high).</p>
                  <div className="priority-colors-panel">
                    <div className="priority-colors-header">
                      <span className="priority-color-label">Level</span>
                      <span className="priority-color-col-label">Fill</span>
                      <span className="priority-color-col-label">Progress</span>
                      <span className="priority-color-preview-label">Preview</span>
                    </div>
                    <div className="priority-colors-grid">
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((p) => {
                        const colors = priorityColors[p] ?? DEFAULT_PRIORITY_COLORS[p];
                        return (
                          <div key={p} className="priority-color-row">
                            <span className="priority-color-label">{p}</span>
                            <label className="priority-color-input-wrap">
                              <input
                                type="color"
                                value={colors.bg}
                                onChange={(e) => handlePriorityColorChange([p], 'bg', e.target.value)}
                                title={`Background priority ${p}`}
                              />
                              <span className="priority-color-swatch" style={{ backgroundColor: colors.bg }} />
                            </label>
                            <label className="priority-color-input-wrap">
                              <input
                                type="color"
                                value={colors.progress}
                                onChange={(e) => handlePriorityColorChange([p], 'progress', e.target.value)}
                                title={`Progress priority ${p}`}
                              />
                              <span className="priority-color-swatch" style={{ backgroundColor: colors.progress }} />
                            </label>
                            <span
                              className="priority-color-preview"
                              style={{
                                background: `linear-gradient(to right, ${colors.progress} 0%, ${colors.bg} 100%)`,
                              }}
                            />
                          </div>
                        );
                      })}
                    </div>
                    <button type="button" className="btn-sm btn-sm-muted" onClick={handleResetPriorityColors}>
                      Reset to defaults
                    </button>
                  </div>
                </div>
              )}
            </div>
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
