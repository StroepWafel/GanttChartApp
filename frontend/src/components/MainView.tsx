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
import { useModal } from '../context/ModalContext';
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
  const [users, setUsers] = useState<{ id: number; username: string; isAdmin: boolean; isActive: boolean; apiKey: string | null; email?: string | null }[]>([]);
  const [showUserManagement, setShowUserManagement] = useState(false);
  const [showCreateManually, setShowCreateManually] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newTempPassword, setNewTempPassword] = useState('');
  const [newManualEmail, setNewManualEmail] = useState('');
  const [editUserEmailId, setEditUserEmailId] = useState<number | null>(null);
  const [editUserEmailValue, setEditUserEmailValue] = useState('');
  const [newOnboardEmail, setNewOnboardEmail] = useState('');
  const [onboardPreviewData, setOnboardPreviewData] = useState<{ email: string; username: string; subject: string; body: string } | null>(null);
  const [onboardSending, setOnboardSending] = useState(false);
  const [onboardResult, setOnboardResult] = useState<{ statusCode: number; status: string; body: unknown } | null>(null);
  const [changePasswordCurrent, setChangePasswordCurrent] = useState('');
  const [changePasswordNew, setChangePasswordNew] = useState('');
  const [changePasswordConfirm, setChangePasswordConfirm] = useState('');
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
  type SettingsTab = 'personal' | 'admin' | 'emailOnboarding' | 'updates' | 'danger';
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('personal');
  const [emailOnboardingSettings, setEmailOnboardingSettings] = useState<api.EmailOnboardingSettings>({});
  const [showEmailOnboardingSetup, setShowEmailOnboardingSetup] = useState(false);
  const [emailOnboardingSaving, setEmailOnboardingSaving] = useState(false);
  const [testOnboardEmailTo, setTestOnboardEmailTo] = useState('');
  const [testOnboardEmailResponse, setTestOnboardEmailResponse] = useState<string | null>(null);
  const [templateValidationError, setTemplateValidationError] = useState<string | null>(null);
  const { isMobile } = useMediaQuery();
  const modal = useModal();
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
        .then((s) => {
          setAutoUpdateEnabled(!!s.auto_update_enabled);
          const eoKeys = [
            'email_onboarding_enabled', 'email_onboarding_use_default_template', 'email_onboarding_api_key',
            'email_onboarding_region', 'email_onboarding_domain', 'email_onboarding_sending_username',
            'email_onboarding_app_domain', 'email_onboarding_your_name', 'email_onboarding_login_url', 'password_reset_base_url',
            'email_onboarding_subject', 'email_onboarding_template',
          ];
          const eo: api.EmailOnboardingSettings = {};
          for (const k of eoKeys) {
            if (s[k] !== undefined) eo[k as keyof api.EmailOnboardingSettings] = s[k];
          }
          setEmailOnboardingSettings(eo);
        })
        .catch(() => {});
    }
  }, [authEnabled, currentUser?.isAdmin]);

  useEffect(() => {
    api.getVersion().then((v) => setAppVersion(v.version)).catch(() => {});
  }, []);

  // Automatic update check every ~10 minutes when enabled (admin only)
  const AUTO_UPDATE_INTERVAL_MS = 10 * 60 * 1000;
  useEffect(() => {
    if (!autoUpdateEnabled || !currentUser?.isAdmin) return;
    function runCheck() {
      api.checkUpdate(false)
        .then(setUpdateCheck)
        .catch(() => setUpdateCheck({ updateAvailable: false, error: 'Check failed' }));
    }
    runCheck();
    const id = setInterval(runCheck, AUTO_UPDATE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [autoUpdateEnabled, currentUser?.isAdmin]);

  useEffect(() => {
    if (showSettings) setSettingsTab('personal');
  }, [showSettings]);

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
      modal.showAlert({ title: 'Error', message: err instanceof Error ? err.message : 'Failed to download backup' });
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
          modal.showAlert({ title: 'Error', message: 'Invalid backup file' });
          return;
        }
        setRestoreConfirmData(data);
      } catch {
        modal.showAlert({ title: 'Error', message: 'Invalid backup file' });
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
      modal.showAlert({ title: 'Error', message: err instanceof Error ? err.message : 'Failed to restore backup' });
    }
  }

  const isMasquerading = typeof window !== 'undefined' && !!localStorage.getItem('gantt_token_admin');

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

      {authEnabled && isMasquerading && currentUser && (
        <div className="masquerade-banner" role="status">
          <span>Viewing as <strong>{currentUser.username}</strong>.</span>
          <button type="button" className="btn-sm" onClick={() => api.stopMasquerade()}>
            Back to admin
          </button>
        </div>
      )}

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

      {onboardPreviewData && (
        <div className="modal-overlay modal-overlay-onboard" onClick={() => { if (!onboardSending) { setOnboardPreviewData(null); setOnboardResult(null); } }}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 500, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
            <h3>{onboardResult ? 'Onboard email sent' : 'Preview onboarding email'}</h3>
            {onboardResult ? (
              <div className="settings-desc">
                <p><strong>Status:</strong> {onboardResult.statusCode} {onboardResult.status}</p>
                <pre style={{ background: 'var(--bg-secondary)', padding: '0.75rem', borderRadius: 4, fontSize: '0.8rem', overflow: 'auto', maxHeight: 200 }}>
                  {JSON.stringify(onboardResult.body, null, 2)}
                </pre>
                <button
                  type="button"
                  className="btn-sm"
                  onClick={() => {
                    setOnboardPreviewData(null);
                    setOnboardResult(null);
                    setNewOnboardEmail('');
                    setNewUsername('');
                    api.getUsers().then(setUsers);
                  }}
                >
                  Close
                </button>
              </div>
            ) : (
              <>
                <div className="settings-desc" style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
                  <p><strong>To:</strong> {onboardPreviewData.email}</p>
                  <p><strong>Subject:</strong> {onboardPreviewData.subject}</p>
                  <p><strong>Body:</strong></p>
                  <pre style={{ whiteSpace: 'pre-wrap', background: 'var(--bg-secondary)', padding: '0.75rem', borderRadius: 4, fontSize: '0.85rem' }}>
                    {onboardPreviewData.body}
                  </pre>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                  <button
                    type="button"
                    className="btn-sm"
                    disabled={onboardSending}
                    onClick={async () => {
                      setOnboardSending(true);
                      try {
                        const data = await api.onboardUser(onboardPreviewData!.email, onboardPreviewData!.username);
                        setOnboardResult(data.mailgunResponse);
                      } catch (err) {
                        modal.showAlert({ title: 'Error', message: err instanceof Error ? err.message : 'Failed to onboard user' });
                      } finally {
                        setOnboardSending(false);
                      }
                    }}
                  >
                    {onboardSending ? 'Sending…' : 'Send invite'}
                  </button>
                  <button
                    type="button"
                    className="btn-sm btn-sm-danger-outline"
                    disabled={onboardSending}
                    onClick={() => { setOnboardPreviewData(null); }}
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
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
          onRequestDeleteCategory={(c) => setDeleteCategoryConfirm(c)}
          onRequestDeleteProject={(p) => setDeleteProjectConfirm(p)}
          onClose={() => { setShowCatProj(false); setEditCategory(null); setEditProject(null); }}
        />
      )}

      {showSettings && (
        <div className="modal-overlay" onClick={() => setShowSettings(false)}>
          <div className={`modal settings-modal${settingsTab === 'emailOnboarding' ? ' settings-modal-wide' : ''}`} onClick={(e) => e.stopPropagation()}>
            <h3>Settings</h3>
            <div className="settings-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={settingsTab === 'personal'}
                className={`settings-tab ${settingsTab === 'personal' ? 'active' : ''}`}
                onClick={() => setSettingsTab('personal')}
              >
                Personal
              </button>
              {currentUser?.isAdmin && (
                <button
                  type="button"
                  role="tab"
                  aria-selected={settingsTab === 'admin'}
                  className={`settings-tab ${settingsTab === 'admin' ? 'active' : ''}`}
                  onClick={() => setSettingsTab('admin')}
                >
                  Admin
                </button>
              )}
              {currentUser?.isAdmin && (
                <button
                  type="button"
                  role="tab"
                  aria-selected={settingsTab === 'emailOnboarding'}
                  className={`settings-tab ${settingsTab === 'emailOnboarding' ? 'active' : ''}`}
                  onClick={() => setSettingsTab('emailOnboarding')}
                >
                  Email invite settings
                </button>
              )}
              {currentUser?.isAdmin && (
                <button
                  type="button"
                  role="tab"
                  aria-selected={settingsTab === 'updates'}
                  className={`settings-tab ${settingsTab === 'updates' ? 'active' : ''}`}
                  onClick={() => setSettingsTab('updates')}
                >
                  Updates
                </button>
              )}
              <button
                type="button"
                role="tab"
                aria-selected={settingsTab === 'danger'}
                className={`settings-tab ${settingsTab === 'danger' ? 'active' : ''}`}
                onClick={() => setSettingsTab('danger')}
              >
                Danger zone
              </button>
            </div>
            {settingsTab === 'personal' && (
              <div className="settings-tab-content" role="tabpanel">
            {authEnabled && currentUser && (
              <div className="settings-section">
                <h4>Account</h4>
                <p className="settings-desc">Signed in as <strong>{currentUser.username}</strong></p>
                {isMasquerading && (
                  <p className="settings-desc masquerade-settings-line">
                    You're acting as this user. <button type="button" className="btn-sm" onClick={() => api.stopMasquerade()}>Back to admin</button>
                  </p>
                )}
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
                    <input
                      type="password"
                      placeholder="Confirm new password"
                      value={changePasswordConfirm}
                      onChange={(e) => setChangePasswordConfirm(e.target.value)}
                      className="settings-input"
                    />
                    <button
                      type="button"
                      className="btn-sm"
                      onClick={async () => {
                        if (!changePasswordCurrent || !changePasswordNew || !changePasswordConfirm) return;
                        if (changePasswordNew !== changePasswordConfirm) {
                          modal.showAlert({ title: 'Error', message: 'New password and confirmation do not match' });
                          return;
                        }
                        try {
                          await api.changePassword(changePasswordCurrent, changePasswordNew);
                          setChangePasswordCurrent('');
                          setChangePasswordNew('');
                          setChangePasswordConfirm('');
                        } catch (err) {
                          modal.showAlert({ title: 'Error', message: err instanceof Error ? err.message : 'Failed to change password' });
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
              </div>
            )}
            {settingsTab === 'admin' && currentUser?.isAdmin && (
              <div className="settings-tab-content" role="tabpanel">
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
                            {editUserEmailId === u.id ? (
                              <div className="user-email-edit" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginLeft: 'auto' }}>
                                <input
                                  type="email"
                                  placeholder="Email"
                                  value={editUserEmailValue}
                                  onChange={(e) => setEditUserEmailValue(e.target.value)}
                                  className="settings-input"
                                  style={{ minWidth: '180px' }}
                                />
                                <button
                                  type="button"
                                  className="btn-sm"
                                  onClick={async () => {
                                    setUserMgmtError('');
                                    try {
                                      await api.updateUser(u.id, { email: editUserEmailValue.trim() || null });
                                      setEditUserEmailId(null);
                                      setEditUserEmailValue('');
                                      api.getUsers().then(setUsers);
                                    } catch (err) {
                                      setUserMgmtError(err instanceof Error ? err.message : 'Failed to update email');
                                    }
                                  }}
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  className="btn-sm btn-sm-danger-outline"
                                  onClick={() => {
                                    setEditUserEmailId(null);
                                    setEditUserEmailValue('');
                                  }}
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <span className="user-email-display" style={{ marginLeft: '0.5rem', color: 'var(--muted)' }}>
                                {u.email ? u.email : '—'}
                                <button
                                  type="button"
                                  className="btn-sm btn-sm-danger-outline"
                                  style={{ marginLeft: '0.5rem', padding: '0.15rem 0.4rem', fontSize: '0.75rem' }}
                                  title="Edit email"
                                  onClick={() => {
                                    setEditUserEmailId(u.id);
                                    setEditUserEmailValue(u.email || '');
                                  }}
                                >
                                  <Pencil size={12} />
                                </button>
                              </span>
                            )}
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
                                      modal.showAlert({ title: 'Error', message: err instanceof Error ? err.message : 'Failed to update user' });
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
                                    const ok = await modal.showConfirm({
                                      title: 'Revoke API key',
                                      message: `Revoke API key for ${u.username}? They will need a new key to use the IoT API.`,
                                      confirmLabel: 'Revoke',
                                      variant: 'danger',
                                    });
                                    if (!ok) return;
                                    try {
                                      await api.updateUser(u.id, { revokeApiKey: true });
                                      api.getUsers().then(setUsers);
                                    } catch (err) {
                                      modal.showAlert({ title: 'Error', message: err instanceof Error ? err.message : 'Failed to revoke API key' });
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
                                      modal.showAlert({ title: 'Error', message: err instanceof Error ? err.message : 'Failed to regenerate API key' });
                                    }
                                  }}
                                >
                                  New API key
                                </button>
                                {!u.isActive && (
                                  <button
                                    type="button"
                                    className="btn-sm btn-sm-danger"
                                    title="Permanently delete this user"
                                    onClick={async () => {
                                      const ok = await modal.showConfirm({
                                        title: 'Delete user permanently',
                                        message: `Permanently delete user "${u.username}"? This cannot be undone. Their categories, projects, and tasks will also be removed.`,
                                        confirmLabel: 'Delete',
                                        variant: 'danger',
                                      });
                                      if (!ok) return;
                                      try {
                                        await api.deleteUser(u.id);
                                        api.getUsers().then(setUsers);
                                      } catch (err) {
                                        modal.showAlert({ title: 'Error', message: err instanceof Error ? err.message : 'Failed to delete user' });
                                      }
                                    }}
                                  >
                                    Delete permanently
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                      <div className="create-user-form">
                        {(emailOnboardingSettings.email_onboarding_enabled &&
                          emailOnboardingSettings.email_onboarding_api_key &&
                          emailOnboardingSettings.email_onboarding_domain) ? (
                          <>
                            <input
                              type="email"
                              placeholder="Email"
                              value={newOnboardEmail}
                              onChange={(e) => { setNewOnboardEmail(e.target.value); setUserMgmtError(''); }}
                              className="settings-input"
                            />
                            <input
                              type="text"
                              placeholder="Username"
                              value={newUsername}
                              onChange={(e) => { setNewUsername(e.target.value); setUserMgmtError(''); }}
                              className="settings-input"
                            />
                            <button
                              type="button"
                              className="btn-sm"
                              disabled={!newOnboardEmail.trim() || !newUsername.trim() || onboardSending}
                              onClick={async () => {
                                const email = newOnboardEmail.trim();
                                const username = newUsername.trim();
                                if (!email || !username) return;
                                setUserMgmtError('');
                                try {
                                  const preview = await api.previewOnboardEmail(username);
                                  setOnboardPreviewData({ email, username, subject: preview.subject, body: preview.body });
                                  setOnboardResult(null);
                                } catch (err) {
                                  setUserMgmtError(err instanceof Error ? err.message : 'Failed to preview');
                                }
                              }}
                            >
                              Onboard
                            </button>
                            <button
                              type="button"
                              className="btn-sm btn-sm-danger-outline"
                              onClick={() => setShowCreateManually((v) => !v)}
                            >
                              {showCreateManually ? 'Hide' : 'Create manually'}
                            </button>
                            {showCreateManually && (
                              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border)' }}>
                                <input
                                  type="email"
                                  placeholder="Email (optional)"
                                  value={newManualEmail}
                                  onChange={(e) => setNewManualEmail(e.target.value)}
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
                                      await api.createUser(newUsername, newTempPassword, newManualEmail.trim() || undefined);
                                      setNewUsername('');
                                      setNewTempPassword('');
                                      setNewManualEmail('');
                                      api.getUsers().then(setUsers);
                                    } catch (err) {
                                      setUserMgmtError(err instanceof Error ? err.message : 'Failed to create user');
                                    }
                                  }}
                                >
                                  Create user
                                </button>
                              </div>
                            )}
                          </>
                        ) : (
                          <>
                            <input
                              type="text"
                              placeholder="Username"
                              value={newUsername}
                              onChange={(e) => setNewUsername(e.target.value)}
                              className="settings-input"
                            />
                            <input
                              type="email"
                              placeholder="Email (optional)"
                              value={newManualEmail}
                              onChange={(e) => setNewManualEmail(e.target.value)}
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
                                      await api.createUser(newUsername, newTempPassword, newManualEmail.trim() || undefined);
                                      setNewUsername('');
                                      setNewTempPassword('');
                                      setNewManualEmail('');
                                      api.getUsers().then(setUsers);
                                } catch (err) {
                                  setUserMgmtError(err instanceof Error ? err.message : 'Failed to create user');
                                }
                              }}
                            >
                              Create user
                            </button>
                          </>
                        )}
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
                          modal.showAlert({ title: 'Error', message: err instanceof Error ? err.message : 'Masquerade failed' });
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
                        modal.showAlert({ title: 'Error', message: err instanceof Error ? err.message : 'Failed to download full backup' });
                      }
                    }}
                  >
                    Download full backup
                  </button>
                </div>
              </div>
            )}
            {settingsTab === 'emailOnboarding' && currentUser?.isAdmin && (
              <div className="settings-tab-content" role="tabpanel">
                <div className="settings-section settings-dropdown">
                  <button
                    type="button"
                    className={`settings-dropdown-trigger ${showEmailOnboardingSetup ? 'expanded' : ''}`}
                    onClick={() => setShowEmailOnboardingSetup((v) => !v)}
                    aria-expanded={showEmailOnboardingSetup}
                  >
                    <span>Mailgun setup instructions</span>
                    <ChevronDown size={16} className={showEmailOnboardingSetup ? 'rotated' : ''} />
                  </button>
                  {showEmailOnboardingSetup && (
                    <div className="settings-dropdown-content">
                      <ol className="settings-desc" style={{ paddingLeft: '1.25rem', marginTop: '0.5rem' }}>
                        <li>Sign up at <a href="https://app.mailgun.com" target="_blank" rel="noopener noreferrer">app.mailgun.com</a></li>
                        <li>Go to API Keys in your dashboard and copy your <strong>Private API key</strong></li>
                        <li>For sandbox: add your email as an authorized recipient and verify it</li>
                        <li>For production: verify your domain and configure DNS (see <a href="https://documentation.mailgun.com/docs/mailgun/quickstart" target="_blank" rel="noopener noreferrer">Mailgun Quickstart</a>)</li>
                        <li>Use <strong>US</strong> base URL (api.mailgun.net) or <strong>EU</strong> (api.eu.mailgun.net) based on your domain region</li>
                      </ol>
                    </div>
                  )}
                </div>
                <div className="settings-section">
                  <div className="settings-checkbox-row">
                    <label>
                      <input
                        type="checkbox"
                        checked={!!emailOnboardingSettings.email_onboarding_enabled}
                        onChange={async (e) => {
                          const v = e.target.checked;
                          setEmailOnboardingSaving(true);
                          try {
                            await api.patchSettings({ email_onboarding_enabled: v });
                            setEmailOnboardingSettings((s) => ({ ...s, email_onboarding_enabled: v }));
                          } catch (err) {
                            modal.showAlert({ title: 'Error', message: err instanceof Error ? err.message : 'Failed to save' });
                          } finally {
                            setEmailOnboardingSaving(false);
                          }
                        }}
                      />
                      Enable email onboarding
                    </label>
                  </div>
                </div>
                <div className={`settings-section email-onboarding-config${!emailOnboardingSettings.email_onboarding_enabled ? ' email-onboarding-disabled' : ''}`}>
                  <h5>API configuration</h5>
                  <p className="settings-desc">Mailgun Private API key and sending domain.</p>
                  <label className="input-label">API key</label>
                  <input
                    type="password"
                    placeholder="••••••••••••"
                    value={emailOnboardingSettings.email_onboarding_api_key ?? ''}
                    onChange={(e) => setEmailOnboardingSettings((s) => ({ ...s, email_onboarding_api_key: e.target.value }))}
                    onBlur={async (e) => {
                      const v = e.target.value;
                      setEmailOnboardingSettings((s) => ({ ...s, email_onboarding_api_key: v }));
                      setEmailOnboardingSaving(true);
                      try {
                        await api.patchSettings({ email_onboarding_api_key: v });
                      } catch (err) {
                        modal.showAlert({ title: 'Error', message: err instanceof Error ? err.message : 'Failed to save' });
                      } finally {
                        setEmailOnboardingSaving(false);
                      }
                    }}
                    className="settings-input"
                    style={{ marginBottom: '0.5rem' }}
                  />
                  <div className="settings-input-row" style={{ marginBottom: '0.5rem' }}>
                    <select
                      value={emailOnboardingSettings.email_onboarding_region ?? 'us'}
                      onChange={async (e) => {
                        const v = e.target.value as 'us' | 'eu';
                        setEmailOnboardingSettings((s) => ({ ...s, email_onboarding_region: v }));
                        setEmailOnboardingSaving(true);
                        try {
                          await api.patchSettings({ email_onboarding_region: v });
                        } catch (err) {
                          modal.showAlert({ title: 'Error', message: err instanceof Error ? err.message : 'Failed to save' });
                        } finally {
                          setEmailOnboardingSaving(false);
                        }
                      }}
                      className="settings-select"
                    >
                      <option value="us">US</option>
                      <option value="eu">EU</option>
                    </select>
                    <input
                      type="text"
                      placeholder="Domain"
                      value={emailOnboardingSettings.email_onboarding_domain ?? ''}
                      onChange={(e) => setEmailOnboardingSettings((s) => ({ ...s, email_onboarding_domain: e.target.value }))}
                      onBlur={async (e) => {
                        const v = e.target.value;
                        setEmailOnboardingSettings((s) => ({ ...s, email_onboarding_domain: v }));
                        setEmailOnboardingSaving(true);
                        try {
                          await api.patchSettings({ email_onboarding_domain: v });
                        } catch (err) {
                          modal.showAlert({ title: 'Error', message: err instanceof Error ? err.message : 'Failed to save' });
                        } finally {
                          setEmailOnboardingSaving(false);
                        }
                      }}
                      className="settings-input"
                      title="e.g. mail.yourdomain.ext"
                    />
                    <input
                      type="text"
                      placeholder="Sending user"
                      value={emailOnboardingSettings.email_onboarding_sending_username ?? 'onboarding'}
                      onChange={(e) => setEmailOnboardingSettings((s) => ({ ...s, email_onboarding_sending_username: e.target.value }))}
                      onBlur={async (e) => {
                        const v = e.target.value;
                        setEmailOnboardingSettings((s) => ({ ...s, email_onboarding_sending_username: v }));
                        setEmailOnboardingSaving(true);
                        try {
                          await api.patchSettings({ email_onboarding_sending_username: v });
                        } catch (err) {
                          modal.showAlert({ title: 'Error', message: err instanceof Error ? err.message : 'Failed to save' });
                        } finally {
                          setEmailOnboardingSaving(false);
                        }
                      }}
                      className="settings-input"
                      style={{ minWidth: '100px' }}
                      title="e.g. onboarding"
                    />
                  </div>
                  <p className="settings-desc muted">
                    From: Gantt &lt;{(emailOnboardingSettings.email_onboarding_sending_username || 'onboarding')}@{emailOnboardingSettings.email_onboarding_domain || '(set domain above)'}&gt;
                  </p>
                </div>
                <div className={`settings-section email-onboarding-config${!emailOnboardingSettings.email_onboarding_enabled ? ' email-onboarding-disabled' : ''}`}>
                  <h5>Email template</h5>
                  <div className="settings-checkbox-row" style={{ marginBottom: '0.75rem' }}>
                    <label>
                      <input
                        type="checkbox"
                        checked={emailOnboardingSettings.email_onboarding_use_default_template !== false}
                        onChange={async (e) => {
                          const v = e.target.checked;
                          setEmailOnboardingSettings((s) => ({ ...s, email_onboarding_use_default_template: v }));
                          setTemplateValidationError(null);
                          setEmailOnboardingSaving(true);
                          try {
                            await api.patchSettings({ email_onboarding_use_default_template: v });
                          } catch (err) {
                            modal.showAlert({ title: 'Error', message: err instanceof Error ? err.message : 'Failed to save' });
                          } finally {
                            setEmailOnboardingSaving(false);
                          }
                        }}
                      />
                      Use default email template
                    </label>
                  </div>
                  {emailOnboardingSettings.email_onboarding_use_default_template === false ? (
                    <div className="email-compose">
                      <div className="email-compose-header">
                        <div className="email-header-row">
                          <span className="email-header-label">From</span>
                          <span className="email-header-value">
                            Gantt &lt;{(emailOnboardingSettings.email_onboarding_sending_username || 'onboarding')}@{emailOnboardingSettings.email_onboarding_domain || '(set domain)'}&gt;
                          </span>
                        </div>
                        <div className="email-header-row">
                          <span className="email-header-label">To</span>
                          <span className="email-header-value muted">(recipient set at invite time)</span>
                        </div>
                        <div className="email-header-row">
                          <span className="email-header-label">Subject</span>
                          <input
                            type="text"
                            placeholder="Your Gantt account is ready"
                            value={emailOnboardingSettings.email_onboarding_subject ?? ''}
                            onChange={(e) => setEmailOnboardingSettings((s) => ({ ...s, email_onboarding_subject: e.target.value }))}
                            onBlur={async (e) => {
                              const v = e.target.value;
                              setEmailOnboardingSettings((s) => ({ ...s, email_onboarding_subject: v }));
                              setEmailOnboardingSaving(true);
                              try {
                                await api.patchSettings({ email_onboarding_subject: v });
                              } catch (err) {
                                modal.showAlert({ title: 'Error', message: err instanceof Error ? err.message : 'Failed to save' });
                              } finally {
                                setEmailOnboardingSaving(false);
                              }
                            }}
                            className="email-header-input"
                          />
                        </div>
                      </div>
                      <div className="email-compose-body">
                        <textarea
                          placeholder={"Hi {{Username}},\n\nYour account for {{app_domain}} is ready.\n\nYou can log in with:\nUsername: {{Username}}\nPassword: {{password}}\n\n– {{your_name}}\nGantt"}
                          value={emailOnboardingSettings.email_onboarding_template ?? ''}
                          onChange={(e) => {
                            setEmailOnboardingSettings((s) => ({ ...s, email_onboarding_template: e.target.value }));
                            setTemplateValidationError(null);
                          }}
                          onBlur={async (e) => {
                            const v = e.target.value;
                            if (!v.includes('{{Username}}') || !v.includes('{{password}}')) {
                              setTemplateValidationError('Template must include {{Username}} and {{password}}');
                              return;
                            }
                            setTemplateValidationError(null);
                            setEmailOnboardingSettings((s) => ({ ...s, email_onboarding_template: v }));
                            setEmailOnboardingSaving(true);
                            try {
                              await api.patchSettings({ email_onboarding_template: v });
                            } catch (err) {
                              modal.showAlert({ title: 'Error', message: err instanceof Error ? err.message : 'Failed to save' });
                            } finally {
                              setEmailOnboardingSaving(false);
                            }
                          }}
                          className="email-body-input"
                          rows={10}
                        />
                        {templateValidationError && (
                          <p className="auth-error" style={{ marginTop: '0.5rem' }}>{templateValidationError}</p>
                        )}
                      </div>
                      <div className="email-compose-vars">
                        <span className="email-var-label">Variables for placeholders:</span>
                        <input
                          type="text"
                          placeholder="App domain"
                          value={emailOnboardingSettings.email_onboarding_app_domain ?? ''}
                          onChange={(e) => setEmailOnboardingSettings((s) => ({ ...s, email_onboarding_app_domain: e.target.value }))}
                          onBlur={async (e) => {
                            const v = e.target.value;
                            setEmailOnboardingSettings((s) => ({ ...s, email_onboarding_app_domain: v }));
                            setEmailOnboardingSaving(true);
                            try { await api.patchSettings({ email_onboarding_app_domain: v }); } catch (err) {
                              modal.showAlert({ title: 'Error', message: err instanceof Error ? err.message : 'Failed to save' });
                            } finally { setEmailOnboardingSaving(false); }
                          }}
                          className="email-var-input"
                          title="{{app_domain}}"
                        />
                        <input
                          type="text"
                          placeholder="Your name"
                          value={emailOnboardingSettings.email_onboarding_your_name ?? ''}
                          onChange={(e) => setEmailOnboardingSettings((s) => ({ ...s, email_onboarding_your_name: e.target.value }))}
                          onBlur={async (e) => {
                            const v = e.target.value;
                            setEmailOnboardingSettings((s) => ({ ...s, email_onboarding_your_name: v }));
                            setEmailOnboardingSaving(true);
                            try { await api.patchSettings({ email_onboarding_your_name: v }); } catch (err) {
                              modal.showAlert({ title: 'Error', message: err instanceof Error ? err.message : 'Failed to save' });
                            } finally { setEmailOnboardingSaving(false); }
                          }}
                          className="email-var-input"
                          title="{{your_name}}"
                        />
                        <input
                          type="text"
                          placeholder="Login URL"
                          value={emailOnboardingSettings.email_onboarding_login_url ?? ''}
                          onChange={(e) => setEmailOnboardingSettings((s) => ({ ...s, email_onboarding_login_url: e.target.value }))}
                          onBlur={async (e) => {
                            const v = e.target.value;
                            setEmailOnboardingSettings((s) => ({ ...s, email_onboarding_login_url: v }));
                            setEmailOnboardingSaving(true);
                            try { await api.patchSettings({ email_onboarding_login_url: v }); } catch (err) {
                              modal.showAlert({ title: 'Error', message: err instanceof Error ? err.message : 'Failed to save' });
                            } finally { setEmailOnboardingSaving(false); }
                          }}
                          className="email-var-input"
                          title="{{login_url}}"
                        />
                      </div>
                      <p className="settings-desc" style={{ marginTop: '0.5rem', fontSize: '0.75rem' }}>
                        Required in body: {"{{Username}}"}, {"{{password}}"}
                      </p>
                    </div>
                  ) : (
                    <div className="email-template-vars">
                      <p className="settings-desc">Customize variables for the default template.</p>
                      <div className="email-var-grid">
                        <label className="input-label">App domain</label>
                        <input
                          type="text"
                          placeholder="gantt.example.com"
                          value={emailOnboardingSettings.email_onboarding_app_domain ?? ''}
                          onChange={(e) => setEmailOnboardingSettings((s) => ({ ...s, email_onboarding_app_domain: e.target.value }))}
                          onBlur={async (e) => {
                            const v = e.target.value;
                            setEmailOnboardingSettings((s) => ({ ...s, email_onboarding_app_domain: v }));
                            setEmailOnboardingSaving(true);
                            try {
                              await api.patchSettings({ email_onboarding_app_domain: v });
                            } catch (err) {
                              modal.showAlert({ title: 'Error', message: err instanceof Error ? err.message : 'Failed to save' });
                            } finally {
                              setEmailOnboardingSaving(false);
                            }
                          }}
                          className="settings-input"
                        />
                        <label className="input-label">Your name (signature)</label>
                        <input
                          type="text"
                          placeholder="The Team"
                          value={emailOnboardingSettings.email_onboarding_your_name ?? ''}
                          onChange={(e) => setEmailOnboardingSettings((s) => ({ ...s, email_onboarding_your_name: e.target.value }))}
                          onBlur={async (e) => {
                            const v = e.target.value;
                            setEmailOnboardingSettings((s) => ({ ...s, email_onboarding_your_name: v }));
                            setEmailOnboardingSaving(true);
                            try {
                              await api.patchSettings({ email_onboarding_your_name: v });
                            } catch (err) {
                              modal.showAlert({ title: 'Error', message: err instanceof Error ? err.message : 'Failed to save' });
                            } finally {
                              setEmailOnboardingSaving(false);
                            }
                          }}
                          className="settings-input"
                        />
                        <label className="input-label">Login URL</label>
                        <input
                          type="text"
                          placeholder="https://gantt.example.com"
                          value={emailOnboardingSettings.email_onboarding_login_url ?? ''}
                          onChange={(e) => setEmailOnboardingSettings((s) => ({ ...s, email_onboarding_login_url: e.target.value }))}
                          onBlur={async (e) => {
                            const v = e.target.value;
                            setEmailOnboardingSettings((s) => ({ ...s, email_onboarding_login_url: v }));
                            setEmailOnboardingSaving(true);
                            try {
                              await api.patchSettings({ email_onboarding_login_url: v });
                            } catch (err) {
                              modal.showAlert({ title: 'Error', message: err instanceof Error ? err.message : 'Failed to save' });
                            } finally {
                              setEmailOnboardingSaving(false);
                            }
                          }}
                          className="settings-input"
                        />
                        <label className="input-label">Password reset base URL</label>
                        <input
                          type="text"
                          placeholder="Same as login URL if blank"
                          value={emailOnboardingSettings.password_reset_base_url ?? ''}
                          onChange={(e) => setEmailOnboardingSettings((s) => ({ ...s, password_reset_base_url: e.target.value }))}
                          onBlur={async (e) => {
                            const v = e.target.value;
                            setEmailOnboardingSettings((s) => ({ ...s, password_reset_base_url: v }));
                            setEmailOnboardingSaving(true);
                            try {
                              await api.patchSettings({ password_reset_base_url: v });
                            } catch (err) {
                              modal.showAlert({ title: 'Error', message: err instanceof Error ? err.message : 'Failed to save' });
                            } finally {
                              setEmailOnboardingSaving(false);
                            }
                          }}
                          className="settings-input"
                          title="Base URL for password reset links (e.g. https://gantt.example.com). Uses Login URL if blank."
                        />
                        <label className="input-label">Subject</label>
                        <input
                          type="text"
                          placeholder="Your Gantt account is ready"
                          value={emailOnboardingSettings.email_onboarding_subject ?? ''}
                          onChange={(e) => setEmailOnboardingSettings((s) => ({ ...s, email_onboarding_subject: e.target.value }))}
                          onBlur={async (e) => {
                            const v = e.target.value;
                            setEmailOnboardingSettings((s) => ({ ...s, email_onboarding_subject: v }));
                            setEmailOnboardingSaving(true);
                            try {
                              await api.patchSettings({ email_onboarding_subject: v });
                            } catch (err) {
                              modal.showAlert({ title: 'Error', message: err instanceof Error ? err.message : 'Failed to save' });
                            } finally {
                              setEmailOnboardingSaving(false);
                            }
                          }}
                          className="settings-input"
                        />
                      </div>
                    </div>
                  )}
                </div>
                <div className="settings-section email-onboarding-config">
                  <h5>Test send</h5>
                  <p className="settings-desc">Send a test email to verify your Mailgun configuration.</p>
                  <div className="settings-input-row" style={{ alignItems: 'center' }}>
                    <input
                      type="email"
                      placeholder="Recipient email"
                      value={testOnboardEmailTo}
                      onChange={(e) => { setTestOnboardEmailTo(e.target.value); setTestOnboardEmailResponse(null); }}
                      className="settings-input"
                      style={{ flex: 1, minWidth: '180px' }}
                    />
                    <button
                      type="button"
                      className="btn-sm"
                      disabled={!testOnboardEmailTo.trim() || emailOnboardingSaving}
                      onClick={async () => {
                        if (!testOnboardEmailTo.trim()) return;
                        setTestOnboardEmailResponse(null);
                        try {
                          const data = await api.sendTestOnboardEmail(testOnboardEmailTo.trim());
                          const r = data.mailgunResponse;
                          setTestOnboardEmailResponse(
                            `Status: ${r.statusCode} ${r.status}\n\nResponse:\n${JSON.stringify(r.body, null, 2)}`
                          );
                        } catch (err) {
                          setTestOnboardEmailResponse(`Error: ${err instanceof Error ? err.message : 'Failed to send'}`);
                        }
                      }}
                    >
                      Send test
                    </button>
                  </div>
                  {testOnboardEmailResponse && (
                    <div className="settings-desc" style={{ marginTop: '0.75rem' }}>
                      <strong>API response:</strong>
                      <pre style={{ marginTop: '0.25rem', padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: 4, fontSize: '0.8rem', overflow: 'auto', maxHeight: 200, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {testOnboardEmailResponse}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            )}
            {settingsTab === 'updates' && currentUser?.isAdmin && (
              <div className="settings-tab-content" role="tabpanel">
                <div className="settings-section">
                  <h5>Updates</h5>
                  <p className="settings-desc settings-version">
                    Version v{appVersion ?? '…'}
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
                            modal.showAlert({ title: 'Error', message: err instanceof Error ? err.message : 'Failed to save' });
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
                          const ok = await modal.showConfirm({
                            title: 'Apply update',
                            message: `Update to v${updateCheck.latestVersion}? A full backup will be created first. The app will restart (PM2 only).`,
                            confirmLabel: 'Update',
                          });
                          if (!ok) return;
                          setApplyingUpdate(true);
                          try {
                            await api.applyUpdate();
                            modal.showAlert({ title: 'Update in progress', message: 'Backup created. Update in progress. You may need to reload the page in a minute or so depending on the performance of the server. The page will attempt to reload automatically in 30 seconds.' });
                            setTimeout(() => window.location.reload(), 3000);
                          } catch (err) {
                            setApplyingUpdate(false);
                            modal.showAlert({ title: 'Error', message: err instanceof Error ? err.message : 'Failed to apply update' });
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
            {settingsTab === 'danger' && (
              <div className="settings-tab-content" role="tabpanel">
                <div className="settings-section">
                  <h4>Danger zone</h4>
                  <button
                    className="btn-danger"
                    onClick={() => setShowClearAllConfirm(true)}
                  >
                    Clear all data
                  </button>
                </div>
              </div>
            )}
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
            setShowCatProj(false);
            setEditCategory(null);
            setEditProject(null);
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
            setShowCatProj(false);
            setEditCategory(null);
            setEditProject(null);
          }}
          onCancel={() => setDeleteProjectConfirm(null)}
          variant="danger"
        />
      )}
    </div>
  );
}
