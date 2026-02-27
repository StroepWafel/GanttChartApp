import { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Pencil, Trash2, CheckSquare, Settings, Copy, Smartphone, Github, MoreVertical } from 'lucide-react';
import * as api from '../api';
import type { Category, Project, Task } from '../types';
import GanttChart from './GanttChart';
import TaskForm from './TaskForm';
import SplitTaskModal from './SplitTaskModal';
import CompletedTasks from './CompletedTasks';
import CategoryProjectForm from './CategoryProjectForm';
import ClearAllConfirmModal from './ClearAllConfirmModal';
import ClearEveryoneConfirmModal from './ClearEveryoneConfirmModal';
import ConfirmModal from './ConfirmModal';
import BottomNav from './BottomNav';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useModal } from '../context/ModalContext';
import { useAdminAlerts } from '../context/AdminAlertsContext';
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
  onUpdateApplySucceeded?: () => void;
}

export default function MainView({ authEnabled, onLogout, onUpdateApplySucceeded }: Props) {
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
  const [showClearEveryoneConfirm, setShowClearEveryoneConfirm] = useState(false);
  const [clearEveryoneError, setClearEveryoneError] = useState<string | null>(null);
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
    releaseName?: string | null;
    releaseUrl?: string;
    error?: string;
    _debug?: Record<string, unknown>;
  } | null>(null);
  const [showUpdateDebug, setShowUpdateDebug] = useState(false);
  const [applyingUpdate, setApplyingUpdate] = useState(false);
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [githubTokenSet, setGithubTokenSet] = useState(false);
  const [githubTokenInput, setGithubTokenInput] = useState('');
  const [githubTokenSaving, setGithubTokenSaving] = useState(false);
  type SettingsTab = 'personal' | 'app' | 'admin' | 'status' | 'emailOnboarding' | 'updates' | 'danger';
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('personal');
  const settingsOpenToTabRef = useRef<SettingsTab | null>(null);
  const [emailOnboardingSettings, setEmailOnboardingSettings] = useState<api.EmailOnboardingSettings>({});
  const [showEmailOnboardingSetup, setShowEmailOnboardingSetup] = useState(false);
  const [emailOnboardingSaving, setEmailOnboardingSaving] = useState(false);
  const [testOnboardEmailTo, setTestOnboardEmailTo] = useState('');
  const [testOnboardEmailResponse, setTestOnboardEmailResponse] = useState<string | null>(null);
  const [templateValidationError, setTemplateValidationError] = useState<string | null>(null);
  const [mobileAppEnabled, setMobileAppEnabled] = useState(false);
  const [mobileApkAvailable, setMobileApkAvailable] = useState(false);
  const [mobileAppEnabledSetting, setMobileAppEnabledSetting] = useState(false);
  const [publicUrl, setPublicUrl] = useState('');
  const [mobileBuildInProgress, setMobileBuildInProgress] = useState(false);
  const [mobileBuildStatus, setMobileBuildStatus] = useState<{ status: 'idle' | 'success' | 'failed'; message?: string }>(() => {
    try {
      const s = localStorage.getItem('gantt_mobile_build_status');
      if (s) {
        const parsed = JSON.parse(s) as { status: 'idle' | 'success' | 'failed'; message?: string };
        if (parsed.status === 'failed' && parsed.message) return parsed;
      }
    } catch {}
    return { status: 'idle' };
  });
  const { isMobile } = useMediaQuery();
  const modal = useModal();
  const adminAlerts = useAdminAlerts();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= 768
  );
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const headerMenuRef = useRef<HTMLDivElement>(null);

  const isSidebarOverlay = isMobile && !sidebarCollapsed;

  useEffect(() => {
    if (!showHeaderMenu) return;
    function handleClickOutside(e: MouseEvent) {
      if (headerMenuRef.current && !headerMenuRef.current.contains(e.target as Node)) {
        setShowHeaderMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showHeaderMenu]);

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
          setGithubTokenSet(!!s.github_token_set);
          setMobileAppEnabledSetting(!!s.mobile_app_enabled);
          setPublicUrl(typeof s.public_url === 'string' ? s.public_url : '');
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

  useEffect(() => {
    api.getMobileAppStatus().then((s) => { setMobileAppEnabled(s.enabled); setMobileApkAvailable(!!s.apkAvailable); }).catch(() => { setMobileAppEnabled(false); setMobileApkAvailable(false); });
  }, []);

  const normalizeUpdateCheck = useCallback((d: { updateAvailable?: boolean; currentVersion?: string; latestVersion?: string; releaseName?: string | null; releaseUrl?: string; error?: string; _debug?: unknown }) => ({
    ...d,
    updateAvailable: d.updateAvailable ?? false,
    _debug: d._debug != null && typeof d._debug === 'object' && !Array.isArray(d._debug) ? (d._debug as Record<string, unknown>) : undefined,
  }), []);

  // One-time update check when admin loads (so we can show "Update available" in corner)
  useEffect(() => {
    if (!authEnabled || !currentUser?.isAdmin) return;
    api.checkUpdate(false)
      .then((d) => setUpdateCheck(normalizeUpdateCheck(d)))
      .catch((err) => {
        const msg = err instanceof Error ? err.message : 'Check failed';
        setUpdateCheck({ updateAvailable: false, error: msg });
      });
  }, [authEnabled, currentUser?.isAdmin, normalizeUpdateCheck]);

  // Automatic update check every ~10 minutes when enabled (admin only)
  const AUTO_UPDATE_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes
  useEffect(() => {
    if (!autoUpdateEnabled || !currentUser?.isAdmin) return;
    function runCheck() {
      api.checkUpdate(false)
        .then((d) => setUpdateCheck(normalizeUpdateCheck(d)))
        .catch((err) => {
          const msg = err instanceof Error ? err.message : 'Check failed';
          setUpdateCheck({ updateAvailable: false, error: msg });
        });
    }
    runCheck();
    const id = setInterval(runCheck, AUTO_UPDATE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [autoUpdateEnabled, currentUser?.isAdmin, normalizeUpdateCheck]);

  useEffect(() => {
    if (showSettings) {
      const openTo = settingsOpenToTabRef.current;
      settingsOpenToTabRef.current = null;
      setSettingsTab(openTo ?? 'personal');
    }
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
    setCategories((prev) => prev.map((c) => (c.id === id ? { ...c, name } : c)));
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
    setProjects((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, name, category_id: categoryId, due_date: dueDate ?? p.due_date, start_date: startDate ?? p.start_date } : p
      )
    );
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

  async function handleClearEveryone(password: string) {
    setClearEveryoneError(null);
    try {
      await api.clearAllDataEveryone(password);
      await load();
      setShowClearEveryoneConfirm(false);
      setShowSettings(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to clear all data';
      adminAlerts.addAlert('Danger zone', 'Error', msg);
      setClearEveryoneError(msg);
    }
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
      const msg = err instanceof Error ? err.message : 'Failed to download backup';
      adminAlerts.addAlert('Backup', 'Error', msg);
      modal.showAlert({ title: 'Error', message: msg });
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
          adminAlerts.addAlert('Restore', 'Error', 'Invalid backup file');
          modal.showAlert({ title: 'Error', message: 'Invalid backup file' });
          return;
        }
        setRestoreConfirmData(data);
      } catch {
        adminAlerts.addAlert('Restore', 'Error', 'Invalid backup file');
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
      const msg = err instanceof Error ? err.message : 'Failed to restore backup';
      adminAlerts.addAlert('Restore', 'Error', msg);
      modal.showAlert({ title: 'Error', message: msg });
    }
  }

  const isMasquerading = typeof window !== 'undefined' && !!localStorage.getItem('gantt_token_admin');

  return (
    <div className="main-view">
      {currentUser?.isAdmin && updateCheck?.updateAvailable && (
        <button
          type="button"
          className="update-available-banner"
          onClick={() => { settingsOpenToTabRef.current = 'updates'; setShowSettings(true); }}
          title="Update available - click to open Settings"
        >
          Update available (v{updateCheck.latestVersion})
        </button>
      )}
      <header className="main-header">
        {!isMobile && (
          <button
            className="sidebar-toggle"
            onClick={() => setSidebarCollapsed((c) => !c)}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        )}
        <h1>Gantt Chart</h1>
        <div className={`header-actions ${isMobile ? 'header-actions-mobile' : ''}`}>
          {isMobile ? (
            <div className="header-menu-wrap" ref={headerMenuRef}>
              <button
                type="button"
                className="btn-sm header-menu-trigger"
                onClick={() => setShowHeaderMenu((v) => !v)}
                title="More options"
                aria-label="More options"
                aria-expanded={showHeaderMenu}
              >
                <MoreVertical size={20} />
              </button>
              {showHeaderMenu && (
                <div className="header-menu-dropdown">
                  {(mobileAppEnabled || currentUser?.isAdmin || !authEnabled) && (
                    <button
                      type="button"
                      className="header-menu-item"
                      onClick={() => { settingsOpenToTabRef.current = 'app'; setShowSettings(true); setShowHeaderMenu(false); }}
                      style={mobileBuildStatus.status === 'failed' ? { borderColor: 'var(--danger)', color: 'var(--danger)' } : undefined}
                    >
                      <Smartphone size={16} />
                      App
                    </button>
                  )}
                  {authEnabled && onLogout && (
                    <button type="button" className="header-menu-item" onClick={() => { onLogout(); setShowHeaderMenu(false); }} aria-label="Logout">
                      Logout
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <>
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
              {(mobileAppEnabled || currentUser?.isAdmin || !authEnabled) && (
                <button
                  type="button"
                  className="btn-sm btn-sm-settings"
                  title={mobileBuildStatus.status === 'failed' ? 'App — build failed (see Settings > App)' : 'App installation & settings'}
                  aria-label={mobileBuildStatus.status === 'failed' ? 'App (build failed)' : 'App'}
                  onClick={() => { settingsOpenToTabRef.current = 'app'; setShowSettings(true); }}
                  style={mobileBuildStatus.status === 'failed' ? { borderColor: 'var(--danger, #dc3545)', boxShadow: '0 0 0 1px var(--danger, #dc3545)' } : undefined}
                >
                  <Smartphone size={16} />
                  <span className="btn-sm-label">App</span>
                </button>
              )}
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
            </>
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
            className={`sidebar ${isSidebarOverlay ? (isMobile ? 'sidebar-bottomsheet' : 'sidebar-overlay') : ''}`}
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
                      onClick={() => { setEditCategory(c); setEditProject(null); setShowCatProj(true); if (isMobile) setSidebarCollapsed(true); }}
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
                        onClick={(e) => { e.stopPropagation(); setEditProject(p); setEditCategory(null); setShowCatProj(true); if (isMobile) setSidebarCollapsed(true); }}
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
              <button className="btn-link" onClick={() => { setEditCategory(null); setEditProject(null); setShowCatProj(true); if (isMobile) setSidebarCollapsed(true); }}>
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

      {isMobile && (
        <BottomNav
          onCategories={() => setSidebarCollapsed(false)}
          onAddTask={() => setShowAddTask(true)}
          onCompleted={() => setShowCompleted(true)}
          onSettings={() => setShowSettings(true)}
          projectsLength={projects.length}
        />
      )}

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
                        const msg = err instanceof Error ? err.message : 'Failed to onboard user';
                        adminAlerts.addAlert('User management', 'Error', msg);
                        modal.showAlert({ title: 'Error', message: msg });
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
            <div className="settings-modal-header">
              <div className="settings-modal-header-top">
                <h3>Settings</h3>
                <button
                  type="button"
                  className="btn-sm settings-modal-close"
                  onClick={() => setShowSettings(false)}
                  aria-label="Close settings"
                >
                  Close
                </button>
              </div>
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
                {(mobileAppEnabled || currentUser?.isAdmin || !authEnabled) && (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={settingsTab === 'app'}
                    className={`settings-tab ${settingsTab === 'app' ? 'active' : ''}`}
                    onClick={() => setSettingsTab('app')}
                  >
                    App
                  </button>
                )}
                {(currentUser?.isAdmin || !authEnabled) && (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={settingsTab === 'status'}
                    className={`settings-tab ${settingsTab === 'status' ? 'active' : ''}`}
                    onClick={() => setSettingsTab('status')}
                  >
                    Status
                    {adminAlerts.alerts.length > 0 && (
                      <span style={{ marginLeft: 4, background: 'var(--danger)', color: 'white', borderRadius: 10, padding: '0 6px', fontSize: 11 }}>{adminAlerts.alerts.length}</span>
                    )}
                  </button>
                )}
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
            </div>
            <div className="settings-modal-body">
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
                  <p className="settings-desc">Set a new password for your account.</p>
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
                          const msg = 'New password and confirmation do not match';
                          adminAlerts.addAlert('User management', 'Error', msg);
                          modal.showAlert({ title: 'Error', message: msg });
                          return;
                        }
                        try {
                          await api.changePassword(changePasswordCurrent, changePasswordNew);
                          setChangePasswordCurrent('');
                          setChangePasswordNew('');
                          setChangePasswordConfirm('');
                        } catch (err) {
                          const msg = err instanceof Error ? err.message : 'Failed to change password';
                          adminAlerts.addAlert('User management', 'Error', msg);
                          modal.showAlert({ title: 'Error', message: msg });
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
                  <p className="settings-desc">Download a copy of your data or restore from a previous backup.</p>
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
                <a href="https://github.com/StroepWafel/GanttChartApp" target="_blank" rel="noopener noreferrer" title="GitHub" aria-label="GitHub" style={{ display: 'inline-block', color: 'var(--muted)', marginTop: 8 }}>
                  <Github size={20} />
                </a>
              </div>
            )}
            {settingsTab === 'app' && (mobileAppEnabled || currentUser?.isAdmin || !authEnabled) && (
              <div className="settings-tab-content" role="tabpanel">
                {mobileAppEnabled && (
                <div className="settings-section">
                  <h4>Mobile app</h4>
                  <p className="settings-desc">
                    Download the native Android app for Gantt Chart. Built with Capacitor.
                  </p>
                  {(currentUser?.isAdmin || !authEnabled) ? (
                    <>
                      {mobileApkAvailable ? (
                        <a
                          href={api.APK_DOWNLOAD_URL}
                          className="btn-sm btn-sm-primary"
                          style={{ display: 'inline-block', marginTop: '0.5rem' }}
                          download="gantt-chart.apk"
                        >
                          Download Android app (APK)
                        </a>
                      ) : (
                        <p className="settings-desc" style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--muted)' }}>
                          APK available after build. Use &quot;Build now&quot; below or run the GitHub workflow.
                        </p>
                      )}
                      <p className="settings-desc" style={{ marginTop: '0.75rem', fontSize: '0.85rem' }}>
                        APK is generated by the build or via the GitHub workflow. To install: enable &quot;Unknown sources&quot; in Android settings, then open the APK file.
                      </p>
                    </>
                  ) : (
                    <>
                      {mobileApkAvailable && (
                        <a
                          href={api.APK_DOWNLOAD_URL}
                          className="btn-sm btn-sm-primary"
                          style={{ display: 'inline-block', marginTop: '0.5rem' }}
                          download="gantt-chart.apk"
                        >
                          Download Android app (APK)
                        </a>
                      )}
                      <p className="settings-desc" style={{ marginTop: '0.75rem', fontSize: '0.85rem' }}>
                        APK is generated by the server. To install: enable &quot;Unknown sources&quot; in Android settings, then open the APK file.
                      </p>
                      <p className="settings-desc" style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--muted)' }}>
                        Do not download APKs from sources you do not trust.
                      </p>
                    </>
                  )}
                </div>
                )}
                {(currentUser?.isAdmin || !authEnabled) && (
                  <>
                    {mobileBuildStatus.status === 'failed' && (
                      <div className="settings-section mobile-build-failed-banner">
                        <p style={{ margin: 0, color: 'var(--text)' }}>
                          Last build failed. Go to{' '}
                          <button
                            type="button"
                            className="btn-link btn-link-inline"
                            onClick={() => { settingsOpenToTabRef.current = 'status'; setShowSettings(true); setSettingsTab('status'); }}
                          >
                            Status
                          </button>
                          {' '}to see more details.
                        </p>
                        <button type="button" className="btn-sm" style={{ marginTop: '8px' }} onClick={() => { setMobileBuildStatus({ status: 'idle' }); localStorage.removeItem('gantt_mobile_build_status'); }}>Dismiss</button>
                      </div>
                    )}
                    {mobileBuildStatus.status === 'success' && (
                      <div className="settings-section" style={{ background: 'var(--success-bg, rgba(25, 135, 84, 0.15))', border: '1px solid var(--success, #198754)', borderRadius: 'var(--radius)', padding: '12px' }}>
                        <p style={{ margin: 0, color: 'var(--success, #198754)' }}>Last build succeeded. Users can access the app at /mobile-app/</p>
                        <button type="button" className="btn-sm" style={{ marginTop: '8px' }} onClick={() => { setMobileBuildStatus({ status: 'idle' }); localStorage.removeItem('gantt_mobile_build_status'); }}>Dismiss</button>
                      </div>
                    )}
                    <div className="settings-section">
                      <h5>Admin: availability</h5>
                      <div className="settings-checkbox-row" style={{ marginBottom: '0.75rem' }}>
                        <label>
                          <input
                            type="checkbox"
                            checked={!!mobileAppEnabledSetting}
                            onChange={async (e) => {
                              const v = e.target.checked;
                              setMobileAppEnabledSetting(v);
                              try {
                                await api.patchSettings({ mobile_app_enabled: v });
                                api.getMobileAppStatus().then((s) => { setMobileAppEnabled(s.enabled); setMobileApkAvailable(!!s.apkAvailable); }).catch(() => {});
                              } catch (err) {
                                setMobileAppEnabledSetting(!v);
                                const msg = err instanceof Error ? err.message : 'Failed to save';
                                adminAlerts.addAlert('Mobile app', 'Error', msg);
                                modal.showAlert({ title: 'Error', message: msg });
                              }
                            }}
                          />
                          <span>Allow users to install the app</span>
                        </label>
                      </div>
                    </div>
                    <div className="settings-section">
                      <h5>Admin: build</h5>
                      <p className="settings-desc">Public URL for the mobile build (set in .env or below). Required for build.</p>
                      <input
                        id="public-url-app"
                        type="url"
                        placeholder="https://gantt.example.com"
                        value={publicUrl}
                        onChange={(e) => setPublicUrl(e.target.value)}
                        onBlur={async () => {
                          const v = publicUrl.trim();
                          try {
                            await api.patchSettings({ public_url: v || null });
                          } catch (err) {
                            const msg = err instanceof Error ? err.message : 'Failed to save';
                            adminAlerts.addAlert('Mobile app', 'Error', msg);
                            modal.showAlert({ title: 'Error', message: msg });
                          }
                        }}
                        className="settings-input"
                        style={{ width: '100%', maxWidth: '360px', marginTop: '0.25rem' }}
                      />
                      <button
                        type="button"
                        className="btn-sm"
                        disabled={mobileBuildInProgress || !publicUrl.trim()}
                        style={{ marginTop: '0.75rem' }}
                        onClick={async () => {
                          setMobileBuildInProgress(true);
                          setMobileBuildStatus({ status: 'idle' });
                          try {
                            const result = await api.buildMobileApp();
                            const msg = result.ok
                              ? 'The mobile app was built successfully. Users can access it at /mobile-app/'
                              : (result.output || result.message || 'Unknown error');
                            const status = { status: result.ok ? 'success' as const : 'failed' as const, message: msg };
                            setMobileBuildStatus(status);
                            if (status.status === 'failed') {
                              localStorage.setItem('gantt_mobile_build_status', JSON.stringify(status));
                              adminAlerts.addAlert('Mobile app', 'Build failed', msg);
                            } else {
                              localStorage.removeItem('gantt_mobile_build_status');
                            }
                            modal.showAlert({
                              title: result.ok ? 'Build complete' : 'Build failed',
                              message: result.ok ? msg : 'See Settings → Status for details.',
                            });
                            if (result.ok) {
                              api.getMobileAppStatus().then((s) => { setMobileAppEnabled(s.enabled); setMobileApkAvailable(!!s.apkAvailable); }).catch(() => {});
                            }
                          } catch (err) {
                            const msg = err instanceof Error ? err.message : 'Unknown error';
                            const status = { status: 'failed' as const, message: msg };
                            setMobileBuildStatus(status);
                            localStorage.setItem('gantt_mobile_build_status', JSON.stringify(status));
                            adminAlerts.addAlert('Mobile app', 'Build failed', msg);
                            modal.showAlert({ title: 'Build failed', message: 'See Settings → Status for details.' });
                          } finally {
                            setMobileBuildInProgress(false);
                          }
                        }}
                      >
                        {mobileBuildInProgress ? 'Building…' : 'Build app now'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
            {settingsTab === 'status' && (currentUser?.isAdmin || !authEnabled) && (
              <div className="settings-tab-content" role="tabpanel">
                <div className="settings-section">
                  <h4>Error status</h4>
                  <p className="settings-desc">Recent errors and failures across the app. Dismiss when resolved.</p>
                  {adminAlerts.alerts.length === 0 ? (
                    <p className="settings-desc" style={{ color: 'var(--success)' }}>No errors recorded.</p>
                  ) : (
                    <>
                      {adminAlerts.alerts.slice().reverse().map((a) => (
                        <div
                          key={a.id}
                          style={{ marginBottom: 12, padding: 12, background: 'rgba(220, 53, 69, 0.1)', border: '1px solid var(--danger)', borderRadius: 'var(--radius)' }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                            <div>
                              <strong>{a.source}: {a.title}</strong>
                              <pre style={{ margin: '8px 0 0', fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'var(--font-mono)' }}>{a.message}</pre>
                              <span style={{ fontSize: 11, color: 'var(--muted)' }}>{new Date(a.timestamp).toLocaleString()}</span>
                            </div>
                            <button type="button" className="btn-sm btn-sm-danger-outline" onClick={() => adminAlerts.dismissAlert(a.id)}>Dismiss</button>
                          </div>
                        </div>
                      ))}
                      <button type="button" className="btn-sm btn-sm-danger-outline" onClick={() => adminAlerts.dismissAll()}>Dismiss all</button>
                    </>
                  )}
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
                                      const msg = err instanceof Error ? err.message : 'Failed to update email';
                                      adminAlerts.addAlert('User management', 'Error', msg);
                                      setUserMgmtError(msg);
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
                                      const msg = err instanceof Error ? err.message : 'Failed to update user';
                                      adminAlerts.addAlert('User management', 'Error', msg);
                                      modal.showAlert({ title: 'Error', message: msg });
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
                                      const msg = err instanceof Error ? err.message : 'Failed to revoke API key';
                                      adminAlerts.addAlert('User management', 'Error', msg);
                                      modal.showAlert({ title: 'Error', message: msg });
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
                                      const msg = err instanceof Error ? err.message : 'Failed to regenerate API key';
                                      adminAlerts.addAlert('User management', 'Error', msg);
                                      modal.showAlert({ title: 'Error', message: msg });
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
                                        const msg = err instanceof Error ? err.message : 'Failed to delete user';
                                        adminAlerts.addAlert('User management', 'Error', msg);
                                        modal.showAlert({ title: 'Error', message: msg });
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
                              type="text"
                              placeholder="Username"
                              value={newUsername}
                              onChange={(e) => { setNewUsername(e.target.value); setUserMgmtError(''); }}
                              className="settings-input"
                            />
                            <input
                              type="email"
                              placeholder="Email"
                              value={newOnboardEmail}
                              onChange={(e) => { setNewOnboardEmail(e.target.value); setUserMgmtError(''); }}
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
                                  const msg = err instanceof Error ? err.message : 'Failed to preview';
                                  adminAlerts.addAlert('User management', 'Error', msg);
                                  setUserMgmtError(msg);
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
                                      const msg = err instanceof Error ? err.message : 'Failed to create user';
                                      adminAlerts.addAlert('User management', 'Error', msg);
                                      setUserMgmtError(msg);
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
                                  const msg = err instanceof Error ? err.message : 'Failed to create user';
                                  adminAlerts.addAlert('User management', 'Error', msg);
                                  setUserMgmtError(msg);
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
                          const msg = err instanceof Error ? err.message : 'Masquerade failed';
                          adminAlerts.addAlert('User management', 'Error', msg);
                          modal.showAlert({ title: 'Error', message: msg });
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
                        const msg = err instanceof Error ? err.message : 'Failed to download full backup';
                        adminAlerts.addAlert('Backup', 'Error', msg);
                        modal.showAlert({ title: 'Error', message: msg });
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
                            const msg = err instanceof Error ? err.message : 'Failed to save';
                            adminAlerts.addAlert('Settings', 'Error', msg);
                            modal.showAlert({ title: 'Error', message: msg });
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
                        const msg = err instanceof Error ? err.message : 'Failed to save';
                        adminAlerts.addAlert('Email onboarding', 'Error', msg);
                        modal.showAlert({ title: 'Error', message: msg });
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
                          const msg = err instanceof Error ? err.message : 'Failed to save';
                          adminAlerts.addAlert('Settings', 'Error', msg);
                          modal.showAlert({ title: 'Error', message: msg });
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
                          const msg = err instanceof Error ? err.message : 'Failed to save';
                          adminAlerts.addAlert('Settings', 'Error', msg);
                          modal.showAlert({ title: 'Error', message: msg });
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
                          const msg = err instanceof Error ? err.message : 'Failed to save';
                          adminAlerts.addAlert('Settings', 'Error', msg);
                          modal.showAlert({ title: 'Error', message: msg });
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
                            const msg = err instanceof Error ? err.message : 'Failed to save';
                            adminAlerts.addAlert('Settings', 'Error', msg);
                            modal.showAlert({ title: 'Error', message: msg });
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
                                const msg = err instanceof Error ? err.message : 'Failed to save';
                                adminAlerts.addAlert('Email onboarding', 'Error', msg);
                                modal.showAlert({ title: 'Error', message: msg });
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
                              const msg = err instanceof Error ? err.message : 'Failed to save';
                              adminAlerts.addAlert('Email onboarding', 'Error', msg);
                              modal.showAlert({ title: 'Error', message: msg });
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
                              const msg = err instanceof Error ? err.message : 'Failed to save';
                              adminAlerts.addAlert('Email onboarding', 'Error', msg);
                              modal.showAlert({ title: 'Error', message: msg });
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
                              const msg = err instanceof Error ? err.message : 'Failed to save';
                              adminAlerts.addAlert('Email onboarding', 'Error', msg);
                              modal.showAlert({ title: 'Error', message: msg });
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
                              const msg = err instanceof Error ? err.message : 'Failed to save';
                              adminAlerts.addAlert('Email onboarding', 'Error', msg);
                              modal.showAlert({ title: 'Error', message: msg });
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
                              const msg = err instanceof Error ? err.message : 'Failed to save';
                              adminAlerts.addAlert('Email onboarding', 'Error', msg);
                              modal.showAlert({ title: 'Error', message: msg });
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
                              const msg = err instanceof Error ? err.message : 'Failed to save';
                              adminAlerts.addAlert('Email onboarding', 'Error', msg);
                              modal.showAlert({ title: 'Error', message: msg });
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
                              const msg = err instanceof Error ? err.message : 'Failed to save';
                              adminAlerts.addAlert('Email onboarding', 'Error', msg);
                              modal.showAlert({ title: 'Error', message: msg });
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
                              const msg = err instanceof Error ? err.message : 'Failed to save';
                              adminAlerts.addAlert('Email onboarding', 'Error', msg);
                              modal.showAlert({ title: 'Error', message: msg });
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
                              const msg = err instanceof Error ? err.message : 'Failed to save';
                              adminAlerts.addAlert('Email onboarding', 'Error', msg);
                              modal.showAlert({ title: 'Error', message: msg });
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
                          const msg = err instanceof Error ? err.message : 'Failed to send';
                          adminAlerts.addAlert('Email onboarding', 'Error', msg);
                          setTestOnboardEmailResponse(`Error: ${msg}`);
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
                            const msg = err instanceof Error ? err.message : 'Failed to save';
                            adminAlerts.addAlert('Updates', 'Error', msg);
                            modal.showAlert({ title: 'Error', message: msg });
                          }
                        }}
                      />
                      Enable automatic update checks
                    </label>
                  </div>
                  <div className="settings-field-row">
                    <label className="input-label">GitHub token (optional)</label>
                    <p className="settings-desc" style={{ marginTop: 0 }}>
                      Add a personal access token to raise the API rate limit from 60 to 5,000 requests/hour. 
                      Leave blank to use the default limit.
                    </p>
                    <p className="settings-desc">
                      To generate a token, go to{" "}
                      <a
                        href="https://github.com/settings/tokens"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        GitHub settings
                      </a>{" "}
                      and create a new classic token. Set the expiration date to never and give it the{" "}
                      <code>public_repo</code> scope.
                    </p>
                    <div className="settings-field-controls">
                      <input
                        type="password"
                        className="settings-input"
                        placeholder={githubTokenSet ? 'Token configured — enter new token to replace' : 'ghp_… (optional)'}
                        value={githubTokenInput}
                        onChange={(e) => setGithubTokenInput(e.target.value)}
                        autoComplete="off"
                        style={{ minWidth: '420px', maxWidth: 560 }}
                      />
                      <button
                        type="button"
                        className="btn-sm"
                        disabled={githubTokenSaving}
                        onClick={async () => {
                          const isClear = !githubTokenInput.trim();
                          if (isClear) {
                            const ok = await modal.showConfirm({
                              title: 'Clear GitHub token',
                              message: 'Remove the saved token? Update checks will use the default rate limit (60 requests/hour).',
                              confirmLabel: 'Clear token',
                              variant: 'danger',
                            });
                            if (!ok) return;
                          }
                          setGithubTokenSaving(true);
                          try {
                            await api.patchSettings({ github_token: githubTokenInput.trim() || '' });
                            setGithubTokenSet(!!githubTokenInput.trim());
                            setGithubTokenInput('');
                            modal.showAlert({ message: githubTokenInput.trim() ? 'Token saved.' : 'Token cleared.' });
                          } catch (err) {
                            const msg = err instanceof Error ? err.message : 'Failed to save';
                            adminAlerts.addAlert('Updates', 'Error', msg);
                            modal.showAlert({ title: 'Error', message: msg });
                          } finally {
                            setGithubTokenSaving(false);
                          }
                        }}
                      >
                        {githubTokenSaving ? 'Saving…' : (githubTokenInput.trim() ? 'Save token' : 'Clear token')}
                      </button>
                    </div>
                  </div>
                  <div className="update-actions">
                    <button
                      type="button"
                      className="btn-sm"
                      onClick={async () => {
                        setUpdateCheck(null);
                        try {
                          const data = await api.checkUpdate(false);
                          setUpdateCheck(normalizeUpdateCheck(data));
                        } catch (err) {
                          const msg = err instanceof Error ? err.message : 'Check failed';
                          setUpdateCheck({ updateAvailable: false, error: msg });
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
                          setUpdateCheck(normalizeUpdateCheck(data));
                          setShowUpdateDebug(true);
                        } catch (err) {
                          const msg = err instanceof Error ? err.message : 'Check failed';
                          setUpdateCheck({ updateAvailable: false, error: msg });
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
                            message: `Update to v${updateCheck.latestVersion}? A full backup will be created first. The server will restart and all users will see an update message; this page will reload automatically once it is back.`,
                            confirmLabel: 'Update',
                          });
                          if (!ok) return;
                          setApplyingUpdate(true);
                          try {
                            await api.applyUpdate();
                            onUpdateApplySucceeded?.();
                          } catch (err) {
                            setApplyingUpdate(false);
                            const msg = err instanceof Error ? err.message : 'Failed to apply update';
                            adminAlerts.addAlert('Updates', 'Error', msg);
                            modal.showAlert({ title: 'Error', message: msg });
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
                          <>
                            Update available: v{updateCheck.latestVersion}
                            {updateCheck.releaseName && (
                              <span className="update-release-name"> — {updateCheck.releaseName}</span>
                            )}
                            {' '}(current: v{updateCheck.currentVersion})
                          </>
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
                <div className="settings-section danger-zone">
                  <h4>Danger zone</h4>
                  <p className="settings-desc">Permanently remove all categories, projects, and tasks. This cannot be undone.</p>
                  <div className="form-actions" style={{ flexWrap: 'wrap', gap: 8 }}>
                    <button
                      type="button"
                      className="btn-danger"
                      onClick={() => setShowClearAllConfirm(true)}
                    >
                      Delete my data
                    </button>
                    {currentUser?.isAdmin && (
                      <button
                        type="button"
                        className="btn-danger"
                        onClick={() => {
                          setClearEveryoneError(null);
                          setShowClearEveryoneConfirm(true);
                        }}
                      >
                        Delete everyone&apos;s data
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
            </div>
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

      {showClearEveryoneConfirm && (
        <ClearEveryoneConfirmModal
          onConfirm={handleClearEveryone}
          onCancel={() => {
            setShowClearEveryoneConfirm(false);
            setClearEveryoneError(null);
          }}
          error={clearEveryoneError}
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
