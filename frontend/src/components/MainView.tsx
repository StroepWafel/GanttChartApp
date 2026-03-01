import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Pencil, Trash2, CheckSquare, Settings, Copy, Smartphone, Github, Plus } from 'lucide-react';
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
import PullToRefresh from './PullToRefresh';
import CategoriesPage from './CategoriesPage';
import SettingsPage from './SettingsPage';
import UpdatesSection from './settings/UpdatesSection';
import UserManagementSection from './settings/UserManagementSection';
import ShortcutsHelpModal from './ShortcutsHelpModal';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { useMainData } from '../hooks/useMainData';
import type { MobilePage } from './BottomNav';
import { useModal } from '../context/ModalContext';
import { useAdminAlerts } from '../context/AdminAlertsContext';
import {
  loadPriorityColors,
  savePriorityColors,
  DEFAULT_PRIORITY_COLORS,
  type PriorityColors,
} from '../priorityColors';
import { getSettingsForBackup, applySettingsFromBackup, type BackupSettings } from '../settingsBackup';
import { exportTasksToCsv, downloadCsv } from '../utils/exportCsv';
import { cancelReminder } from '../reminders';
import { applyTheme, getStoredTheme, setStoredTheme, type Theme } from '../theme';
import './MainView.css';

interface Props {
  authEnabled?: boolean;
  onLogout?: () => void;
  onUpdateApplySucceeded?: () => void;
}

export default function MainView({ authEnabled, onLogout, onUpdateApplySucceeded }: Props) {
  const [showAddTask, setShowAddTask] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showCatProj, setShowCatProj] = useState(false);
  const [mobilePage, setMobilePage] = useState<MobilePage>('chart');
  const [showAddForm, setShowAddForm] = useState(false);
  const [splitTask, setSplitTask] = useState<Task | null>(null);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [editCategory, setEditCategory] = useState<Category | null>(null);
  const [editProject, setEditProject] = useState<Project | null>(null);
  const [includeCompleted, setIncludeCompleted] = useState(false);
  const { categories, projects, tasks, load, setCategories, setProjects } = useMainData(includeCompleted);
  const [showClearAllConfirm, setShowClearAllConfirm] = useState(false);
  const [showClearEveryoneConfirm, setShowClearEveryoneConfirm] = useState(false);
  const [clearEveryoneError, setClearEveryoneError] = useState<string | null>(null);
  const [deleteCategoryConfirm, setDeleteCategoryConfirm] = useState<Category | null>(null);
  const [deleteProjectConfirm, setDeleteProjectConfirm] = useState<Project | null>(null);
  const [restoreConfirmData, setRestoreConfirmData] = useState<Record<string, unknown> | null>(null);
  const [priorityColors, setPriorityColors] = useState<PriorityColors>(() => loadPriorityColors());
  const [showPriorityColors, setShowPriorityColors] = useState(false);
  const [showWebhooks, setShowWebhooks] = useState(false);
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
  const [mobileIosAvailable, setMobileIosAvailable] = useState(false);
  const [iosUploading, setIosUploading] = useState(false);
  const [mobileAppEnabledSetting, setMobileAppEnabledSetting] = useState(false);
  const [publicUrl, setPublicUrl] = useState('');
  const [mobileBuildInProgress, setMobileBuildInProgress] = useState(false);
  const [mobileBuildStatus, setMobileBuildStatus] = useState<{ status: 'idle' | 'building' | 'success' | 'failed'; message?: string }>(() => {
    try {
      const s = localStorage.getItem('gantt_mobile_build_status');
      if (s) {
        const parsed = JSON.parse(s) as { status: 'idle' | 'building' | 'success' | 'failed'; message?: string };
        if (parsed.status === 'failed' && parsed.message) return parsed;
      }
    } catch {}
    return { status: 'idle' };
  });
  const { isMobile } = useMediaQuery();
  const [isNativeApp, setIsNativeApp] = useState(false);
  const [mobileAppPromptDismissed, setMobileAppPromptDismissed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('gantt_mobile_app_prompt_dismissed') === '1';
  });
  const [mobileAppUpdateAvailable, setMobileAppUpdateAvailable] = useState(false);
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  const [theme, setThemeState] = useState<Theme>(() => getStoredTheme());
  const [webhooks, setWebhooks] = useState<{ id: string; url: string; type: 'generic' | 'discord'; events: { created: boolean; updated: boolean; deleted: boolean; completed: boolean } }[]>([]);
  const [searchInputValue, setSearchInputValue] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    const id = setTimeout(() => setSearchQuery(searchInputValue.trim().toLowerCase()), 300);
    return () => clearTimeout(id);
  }, [searchInputValue]);
  const modal = useModal();
  const adminAlerts = useAdminAlerts();

  const handleDownloadApk = useCallback(async () => {
    try {
      await api.downloadApk();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Download failed';
      modal.showAlert({ title: 'Download failed', message: msg });
    }
  }, [modal]);

  const handleDownloadIos = useCallback(async () => {
    try {
      await api.downloadIosBuild();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Download failed';
      modal.showAlert({ title: 'Download failed', message: msg });
    }
  }, [modal]);

  const handleEscape = useCallback(() => {
    if (showShortcutsHelp) setShowShortcutsHelp(false);
    else if (showSettings && !isMobile) setShowSettings(false);
    else if (showAddTask || editTask) {
      setShowAddTask(false);
      setEditTask(null);
    } else if (splitTask) setSplitTask(null);
    else if (editCategory) setEditCategory(null);
    else if (editProject) setEditProject(null);
    else if (showCompleted) setShowCompleted(false);
    else if (showCatProj) setShowCatProj(false);
  }, [showShortcutsHelp, showSettings, showAddTask, editTask, splitTask, editCategory, editProject, showCompleted, showCatProj, isMobile]);

  useKeyboardShortcuts({
    onNewTask: () => setShowAddTask(true),
    onFocusSearch: () => searchInputRef.current?.focus(),
    onEscape: handleEscape,
    onShowShortcuts: () => setShowShortcutsHelp(true),
    onShowCompleted: () => setShowCompleted(true),
    onShowSettings: () => setShowSettings(true),
    onShowCategories: () => { setEditCategory(null); setEditProject(null); setShowCatProj(true); },
    enabled: !isMobile,
  });

  const filteredTasks = useMemo(() => {
    if (!searchQuery) return tasks;
    return tasks.filter(
      (t) =>
        t.name.toLowerCase().includes(searchQuery) ||
        (t.project_name?.toLowerCase().includes(searchQuery)) ||
        (t.category_name?.toLowerCase().includes(searchQuery))
    );
  }, [tasks, searchQuery]);

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
    api.getMobileAppStatus().then((s) => { setMobileAppEnabled(s.enabled); setMobileApkAvailable(!!s.apkAvailable); setMobileIosAvailable(!!s.iosAvailable); }).catch(() => { setMobileAppEnabled(false); setMobileApkAvailable(false); setMobileIosAvailable(false); });
  }, []);

  useEffect(() => {
    setIsNativeApp((window as any).Capacitor?.isNativePlatform?.() === true);
  }, []);

  useEffect(() => {
    if (!isNativeApp) return;
    const embedded = (import.meta.env.VITE_APP_VERSION as string) || '';
    if (!embedded) return;
    api.getVersion()
      .then((v) => {
        if (api.compareVersions(v.version, embedded) > 0) setMobileAppUpdateAvailable(true);
      })
      .catch(() => {});
  }, [isNativeApp]);

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
    if (isMobile && mobilePage === 'settings') {
      const openTo = settingsOpenToTabRef.current;
      settingsOpenToTabRef.current = null;
      if (openTo) setSettingsTab(openTo);
    }
  }, [isMobile, mobilePage]);

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
          const t = prefs.theme as Theme | undefined;
          if (t === 'light' || t === 'dark') {
            applyTheme(t);
            setThemeState(t);
          }
          const wh = prefs.webhooks;
          if (Array.isArray(wh)) {
            setWebhooks(wh.filter((w) => w?.url && typeof w.url === 'string').map((w) => ({
              id: w.id || `wh_${Math.random().toString(36).slice(2)}`,
              url: String(w.url).trim(),
              type: w.type === 'discord' ? 'discord' : 'generic',
              events: {
                created: (w.events as { created?: boolean })?.created !== false,
                updated: (w.events as { updated?: boolean })?.updated !== false,
                deleted: (w.events as { deleted?: boolean })?.deleted !== false,
                completed: (w.events as { completed?: boolean })?.completed !== false,
              },
            })));
          } else {
            const legacy = prefs.webhook_url;
            if (typeof legacy === 'string' && legacy.trim()) {
              setWebhooks([{ id: `wh_${Math.random().toString(36).slice(2)}`, url: legacy.trim(), type: 'generic', events: { created: true, updated: true, deleted: true, completed: true } }]);
            } else {
              setWebhooks([]);
            }
          }
        })
        .catch(() => {});
    }
  }, [authEnabled]);

  const refreshAll = useCallback(async () => {
    await load();
    api.getMobileAppStatus().then((s) => { setMobileAppEnabled(s.enabled); setMobileApkAvailable(!!s.apkAvailable); setMobileIosAvailable(!!s.iosAvailable); }).catch(() => {});
    if (authEnabled) {
      api.getMe()
        .then((u) => setCurrentUser({ id: u.id, username: u.username, isAdmin: u.isAdmin, apiKey: u.apiKey ?? null }))
        .catch(() => setCurrentUser(null));
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
          const t = prefs.theme as Theme | undefined;
          if (t === 'light' || t === 'dark') {
            applyTheme(t);
            setThemeState(t);
          }
          const wh = prefs.webhooks;
          if (Array.isArray(wh)) {
            setWebhooks(wh.filter((w) => w?.url && typeof w.url === 'string').map((w) => ({
              id: w.id || `wh_${Math.random().toString(36).slice(2)}`,
              url: String(w.url).trim(),
              type: w.type === 'discord' ? 'discord' : 'generic',
              events: {
                created: (w.events as { created?: boolean })?.created !== false,
                updated: (w.events as { updated?: boolean })?.updated !== false,
                deleted: (w.events as { deleted?: boolean })?.deleted !== false,
                completed: (w.events as { completed?: boolean })?.completed !== false,
              },
            })));
          } else {
            const legacy = prefs.webhook_url;
            if (typeof legacy === 'string' && legacy.trim()) {
              setWebhooks([{ id: `wh_${Math.random().toString(36).slice(2)}`, url: legacy.trim(), type: 'generic', events: { created: true, updated: true, deleted: true, completed: true } }]);
            } else {
              setWebhooks([]);
            }
          }
        })
        .catch(() => {});
    }
    if (currentUser?.isAdmin) {
      api.getUsers().then(setUsers).catch(() => setUsers([]));
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
      api.checkUpdate(false)
        .then((d) => setUpdateCheck(normalizeUpdateCheck(d)))
        .catch((err) => {
          const msg = err instanceof Error ? err.message : 'Check failed';
          setUpdateCheck({ updateAvailable: false, error: msg });
        });
    }
  }, [load, authEnabled, currentUser?.isAdmin, normalizeUpdateCheck]);

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
    const task = await api.createTask(data);
    await load();
    setShowAddTask(false);
    return { id: task.id };
  }

  async function handleUpdateTask(id: number, data: Parameters<typeof api.updateTask>[1]) {
    if (data.completed) cancelReminder(id);
    await api.updateTask(id, data);
    await load();
  }

  async function handleDeleteTask(id: number, cascade: boolean) {
    cancelReminder(id);
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

  function renderSettingsTabContent() {
    return (
      <>
        {settingsTab === 'personal' && (
          <div className="settings-tab-content" role="tabpanel">
            <div className="settings-section">
              <h4>Appearance</h4>
              <div className="settings-checkbox-row">
                <input
                  type="checkbox"
                  checked={theme === 'light'}
                  onChange={async (e) => {
                    const next: Theme = e.target.checked ? 'light' : 'dark';
                    setStoredTheme(next);
                    setThemeState(next);
                    if (authEnabled) {
                      try {
                        await api.patchUserPreferences('theme', next);
                      } catch { /* ignore */ }
                    }
                  }}
                />
                <span>Light theme</span>
              </div>
            </div>
            {authEnabled && currentUser && (
              <div className="settings-section">
                <h4>Account</h4>
                <p className="settings-desc">Signed in as <strong>{currentUser.username}</strong></p>
                {isMasquerading && (
                  <p className="settings-desc masquerade-settings-line">
                    You&apos;re acting as this user. <button type="button" className="btn-sm" onClick={() => api.stopMasquerade()}>Back to admin</button>
                  </p>
                )}
                <div className="settings-section">
                  <h5>Change password</h5>
                  <p className="settings-desc">Set a new password for your account.</p>
                  <div className="change-password-form">
                    <input type="password" placeholder="Current password" value={changePasswordCurrent} onChange={(e) => setChangePasswordCurrent(e.target.value)} className="settings-input" />
                    <input type="password" placeholder="New password" value={changePasswordNew} onChange={(e) => setChangePasswordNew(e.target.value)} className="settings-input" />
                    <input type="password" placeholder="Confirm new password" value={changePasswordConfirm} onChange={(e) => setChangePasswordConfirm(e.target.value)} className="settings-input" />
                    <button type="button" className="btn-sm" onClick={async () => {
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
                    }}>Change password</button>
                  </div>
                </div>
                <div className="settings-section">
                  <h5>API key</h5>
                  <p className="settings-desc">Use with X-API-Username and X-API-Key for read-only IoT API.</p>
                  {currentUser.apiKey ? (
                    <div className="api-key-row">
                      <code className="api-key-value">{currentUser.apiKey}</code>
                      <button type="button" className="btn-sm" title="Copy API key" aria-label="Copy API key" onClick={() => navigator.clipboard.writeText(currentUser.apiKey!)}><Copy size={16} /></button>
                    </div>
                  ) : <p className="muted">No API key</p>}
                </div>
                <div className="settings-section settings-dropdown">
                  <button
                    type="button"
                    className={`settings-dropdown-trigger ${showWebhooks ? 'expanded' : ''}`}
                    onClick={() => setShowWebhooks((v) => !v)}
                    aria-expanded={showWebhooks}
                  >
                    <span>Webhooks</span>
                    <ChevronDown size={16} className={showWebhooks ? 'rotated' : ''} />
                  </button>
                  {showWebhooks && (
                  <div className="settings-dropdown-content">
                  <p className="settings-desc">POST task events (create, update, delete, complete) to URLs. Toggle C/U/D/✓ per webhook. Choose type for Discord or generic format.</p>
                  <div className="webhooks-table-wrap">
                    <table className="webhooks-table">
                      <thead>
                        <tr>
                          <th>URL</th>
                          <th>Type</th>
                          <th className="webhooks-events-th">Events</th>
                          <th aria-label="Actions" />
                        </tr>
                      </thead>
                      <tbody>
                        {webhooks.map((w) => (
                          <tr key={w.id}>
                            <td>
                              <input
                                type="url"
                                placeholder="https://example.com/webhook"
                                value={w.url}
                                onChange={(e) => setWebhooks((prev) => prev.map((x) => (x.id === w.id ? { ...x, url: e.target.value } : x)))}
                                onBlur={async (e) => {
                                  const newUrl = e.target.value.trim();
                                  const next = webhooks.map((x) => (x.id === w.id ? { ...x, url: newUrl } : x));
                                  const toSave = next.filter((x) => x.url.trim()).map((x) => ({ id: x.id, url: x.url.trim(), type: x.type, events: x.events }));
                                  setWebhooks(newUrl ? next : next.filter((x) => x.id !== w.id));
                                  try {
                                    await api.patchUserPreferences('webhooks', toSave);
                                  } catch { /* ignore */ }
                                }}
                                className="settings-input"
                              />
                            </td>
                            <td>
                              <select
                                value={w.type}
                                onChange={async (e) => {
                                  const type = e.target.value as 'generic' | 'discord';
                                  const next = webhooks.map((x) => (x.id === w.id ? { ...x, type } : x));
                                  setWebhooks(next);
                                  const toSave = next.filter((x) => x.url.trim()).map((x) => ({ id: x.id, url: x.url.trim(), type: x.type, events: x.events }));
                                  try {
                                    await api.patchUserPreferences('webhooks', toSave);
                                  } catch { /* ignore */ }
                                }}
                                className="settings-select"
                              >
                                <option value="generic">Generic JSON</option>
                                <option value="discord">Discord</option>
                              </select>
                            </td>
                            <td className="webhooks-events-cell">
                              <div className="webhook-events-group">
                              <label className="webhook-event-label" title="Send on task create">
                                <input
                                  type="checkbox"
                                  checked={w.events.created}
                                  onChange={async () => {
                                    const nextEv = { ...w.events, created: !w.events.created };
                                    const next = webhooks.map((x) => (x.id === w.id ? { ...x, events: nextEv } : x));
                                    setWebhooks(next);
                                    const toSave = next.filter((x) => x.url.trim()).map((x) => ({ id: x.id, url: x.url.trim(), type: x.type, events: x.events }));
                                    try { await api.patchUserPreferences('webhooks', toSave); } catch { /* ignore */ }
                                  }}
                                />
                                <span>C</span>
                              </label>
                              <label className="webhook-event-label" title="Send on task update">
                                <input
                                  type="checkbox"
                                  checked={w.events.updated}
                                  onChange={async () => {
                                    const nextEv = { ...w.events, updated: !w.events.updated };
                                    const next = webhooks.map((x) => (x.id === w.id ? { ...x, events: nextEv } : x));
                                    setWebhooks(next);
                                    const toSave = next.filter((x) => x.url.trim()).map((x) => ({ id: x.id, url: x.url.trim(), type: x.type, events: x.events }));
                                    try { await api.patchUserPreferences('webhooks', toSave); } catch { /* ignore */ }
                                  }}
                                />
                                <span>U</span>
                              </label>
                              <label className="webhook-event-label" title="Send on task delete">
                                <input
                                  type="checkbox"
                                  checked={w.events.deleted}
                                  onChange={async () => {
                                    const nextEv = { ...w.events, deleted: !w.events.deleted };
                                    const next = webhooks.map((x) => (x.id === w.id ? { ...x, events: nextEv } : x));
                                    setWebhooks(next);
                                    const toSave = next.filter((x) => x.url.trim()).map((x) => ({ id: x.id, url: x.url.trim(), type: x.type, events: x.events }));
                                    try { await api.patchUserPreferences('webhooks', toSave); } catch { /* ignore */ }
                                  }}
                                />
                                <span>D</span>
                              </label>
                              <label className="webhook-event-label" title="Send on task complete">
                                <input
                                  type="checkbox"
                                  checked={w.events.completed}
                                  onChange={async () => {
                                    const nextEv = { ...w.events, completed: !w.events.completed };
                                    const next = webhooks.map((x) => (x.id === w.id ? { ...x, events: nextEv } : x));
                                    setWebhooks(next);
                                    const toSave = next.filter((x) => x.url.trim()).map((x) => ({ id: x.id, url: x.url.trim(), type: x.type, events: x.events }));
                                    try { await api.patchUserPreferences('webhooks', toSave); } catch { /* ignore */ }
                                  }}
                                />
                                <span>✓</span>
                              </label>
                              </div>
                            </td>
                            <td>
                              <button
                                type="button"
                                className="btn-sm btn-sm-danger-outline"
                                title="Remove webhook"
                                aria-label="Remove webhook"
                                onClick={async () => {
                                  const next = webhooks.filter((x) => x.id !== w.id);
                                  setWebhooks(next);
                                  const toSave = next.filter((x) => x.url.trim()).map((x) => ({ id: x.id, url: x.url.trim(), type: x.type, events: x.events }));
                                  try {
                                    await api.patchUserPreferences('webhooks', toSave);
                                  } catch { /* ignore */ }
                                }}
                              >
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="webhooks-add-btn-wrap">
                    <button
                      type="button"
                      className="btn-sm webhooks-add-btn"
                      onClick={() => {
                        const id = `wh_${Math.random().toString(36).slice(2)}`;
                        setWebhooks((prev) => [...prev, { id, url: '', type: 'generic' as const, events: { created: true, updated: true, deleted: true, completed: true } }]);
                      }}
                    >
                      <Plus size={14} /> Add webhook
                    </button>
                    </div>
                  </div>
                  </div>
                  )}
                </div>
              </div>
            )}
            <div className="settings-section settings-dropdown">
              <button type="button" className={`settings-dropdown-trigger ${showPriorityColors ? 'expanded' : ''}`} onClick={() => setShowPriorityColors((v) => !v)} aria-expanded={showPriorityColors}>
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
                              <input type="color" value={colors.bg} onChange={(e) => handlePriorityColorChange([p], 'bg', e.target.value)} title={`Background priority ${p}`} />
                              <span className="priority-color-swatch" style={{ backgroundColor: colors.bg }} />
                            </label>
                            <label className="priority-color-input-wrap">
                              <input type="color" value={colors.progress} onChange={(e) => handlePriorityColorChange([p], 'progress', e.target.value)} title={`Progress priority ${p}`} />
                              <span className="priority-color-swatch" style={{ backgroundColor: colors.progress }} />
                            </label>
                            <span className="priority-color-preview" style={{ background: `linear-gradient(to right, ${colors.progress} 0%, ${colors.bg} 100%)` }} />
                          </div>
                        );
                      })}
                    </div>
                    <button type="button" className="btn-sm btn-sm-muted" onClick={handleResetPriorityColors}>Reset to defaults</button>
                  </div>
                </div>
              )}
            </div>
            <div className="settings-section">
              <h4>Backup</h4>
              <p className="settings-desc">Download a copy of your data or restore from a previous backup.</p>
              <div className="settings-actions">
                <button className="btn-sm" onClick={handleDownloadBackup}>Download backup</button>
                <label className="btn-sm btn-sm-restore">Restore backup<input type="file" accept=".json,application/json" onChange={handleRestoreFileSelect} style={{ display: 'none' }} /></label>
              </div>
            </div>
            <div className="settings-section">
              <h4>Export</h4>
              <p className="settings-desc">Export tasks to CSV for use in spreadsheets.</p>
              <button className="btn-sm" onClick={async () => {
                try {
                  const allTasks = await api.getTasks(true);
                  const csv = exportTasksToCsv(allTasks);
                  downloadCsv(csv, `gantt-tasks-${new Date().toISOString().slice(0, 10)}.csv`);
                } catch (err) {
                  const msg = err instanceof Error ? err.message : 'Export failed';
                  modal.showAlert({ title: 'Export failed', message: msg });
                }
              }}>Export to CSV</button>
            </div>
            {authEnabled && onLogout && (
              <div className="settings-section">
                <button type="button" className="btn-sm" onClick={onLogout}>Logout</button>
              </div>
            )}
            <a href="https://github.com/StroepWafel/GanttChartApp" target="_blank" rel="noopener noreferrer" title="GitHub" aria-label="GitHub" style={{ display: 'inline-block', color: 'var(--muted)', marginTop: 8 }}><Github size={20} /></a>
          </div>
        )}
        {settingsTab === 'app' && (mobileAppEnabled || currentUser?.isAdmin || !authEnabled) && (
          <div className="settings-tab-content" role="tabpanel">
            {mobileAppEnabled && (
              <div className="settings-section">
                <h4>Mobile app</h4>
                <p className="settings-desc">Download the native Android or iOS app for Gantt Chart. Built with Capacitor.</p>
                {(currentUser?.isAdmin || !authEnabled) ? (
                  <>
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
                      {mobileApkAvailable ? (
                        <button type="button" className="btn-sm btn-sm-primary" onClick={handleDownloadApk}>{isNativeApp ? 'Update app' : 'Download Android (APK)'}</button>
                      ) : (
                        <span className="settings-desc" style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>APK: use &quot;Build now&quot; below or GitHub workflow.</span>
                      )}
                      {mobileIosAvailable ? (
                        <button type="button" className="btn-sm btn-sm-primary" onClick={handleDownloadIos}>Download iOS (IPA)</button>
                      ) : (
                        <span className="settings-desc" style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>iOS: upload .ipa via Admin section below.</span>
                      )}
                    </div>
                    <p className="settings-desc" style={{ marginTop: '0.75rem', fontSize: '0.85rem' }}>Android APK is built by the server. iOS requires macOS/Xcode — build locally or via CI, then upload.</p>
                  </>
                ) : (
                  <>
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
                      {mobileApkAvailable && (
                        <button type="button" className="btn-sm btn-sm-primary" onClick={handleDownloadApk}>{isNativeApp ? 'Update app' : 'Download Android (APK)'}</button>
                      )}
                      {mobileIosAvailable && (
                        <button type="button" className="btn-sm btn-sm-primary" onClick={handleDownloadIos}>Download iOS (IPA)</button>
                      )}
                    </div>
                    <p className="settings-desc" style={{ marginTop: '0.75rem', fontSize: '0.85rem' }}>Apps are served by the server.</p>
                  </>
                )}
              </div>
            )}
            {(currentUser?.isAdmin || !authEnabled) && (
              <>
                {mobileBuildStatus.status === 'failed' && (
                  <div className="settings-section mobile-build-failed-banner">
                    <p style={{ margin: 0, color: 'var(--text)' }}>Last build failed. See Status for details.</p>
                    <button type="button" className="btn-sm" style={{ marginTop: '8px' }} onClick={() => { setMobileBuildStatus({ status: 'idle' }); localStorage.removeItem('gantt_mobile_build_status'); }}>Dismiss</button>
                  </div>
                )}
                <div className="settings-section">
                  <h5>Admin: availability</h5>
                  <div className="settings-checkbox-row" style={{ marginBottom: '0.75rem' }}>
                    <input type="checkbox" checked={!!mobileAppEnabledSetting} onChange={async (e) => {
                      const v = e.target.checked;
                      setMobileAppEnabledSetting(v);
                      try {
                        await api.patchSettings({ mobile_app_enabled: v });
                        api.getMobileAppStatus().then((s) => { setMobileAppEnabled(s.enabled); setMobileApkAvailable(!!s.apkAvailable); setMobileIosAvailable(!!s.iosAvailable); }).catch(() => {});
                      } catch (err) {
                        setMobileAppEnabledSetting(!v);
                        const msg = err instanceof Error ? err.message : 'Failed to save';
                        adminAlerts.addAlert('Mobile app', 'Error', msg);
                        modal.showAlert({ title: 'Error', message: msg });
                      }
                    }} />
                    <span>Allow users to install the app</span>
                  </div>
                </div>
                <div className="settings-section">
                  <h5>Admin: build</h5>
                  <p className="settings-desc">Public URL for the mobile build.</p>
                  <input id="public-url-app" type="url" placeholder="https://gantt.example.com" value={publicUrl} onChange={(e) => setPublicUrl(e.target.value)} onBlur={async () => {
                    const v = publicUrl.trim();
                    try {
                      await api.patchSettings({ public_url: v || null });
                    } catch (err) {
                      const msg = err instanceof Error ? err.message : 'Failed to save';
                      adminAlerts.addAlert('Mobile app', 'Error', msg);
                      modal.showAlert({ title: 'Error', message: msg });
                    }
                  }} className="settings-input" style={{ width: '100%', maxWidth: '360px', marginTop: '0.25rem' }} />
                  <button type="button" className="btn-sm" disabled={mobileBuildInProgress || !publicUrl.trim()} style={{ marginTop: '0.75rem' }} onClick={async () => {
                    setMobileBuildInProgress(true);
                    setMobileBuildStatus({ status: 'idle' });
                    try {
                      const start = await api.startMobileBuild();
                      if (!start.ok) {
                        const msg = start.error || 'Failed to start build';
                        setMobileBuildStatus({ status: 'failed', message: msg });
                        localStorage.setItem('gantt_mobile_build_status', JSON.stringify({ status: 'failed', message: msg }));
                        adminAlerts.addAlert('Mobile app', 'Build failed', msg);
                        modal.showAlert({ title: 'Build failed', message: msg });
                        setMobileBuildInProgress(false);
                        return;
                      }
                      const poll = async (): Promise<void> => {
                        const s = await api.getMobileBuildStatus();
                        setMobileBuildStatus({ status: s.status, message: s.output || s.error || undefined });
                        if (s.status === 'building' || s.status === 'idle') {
                          setTimeout(poll, 2500);
                          return;
                        }
                        setMobileBuildInProgress(false);
                        if (s.status === 'failed') {
                          const msg = s.output || s.error || 'Unknown error';
                          localStorage.setItem('gantt_mobile_build_status', JSON.stringify({ status: 'failed', message: msg }));
                          adminAlerts.addAlert('Mobile app', 'Build failed', msg);
                          modal.showAlert({ title: 'Build failed', message: 'See Settings → Status for details.' });
                        } else if (s.status === 'success') {
                          localStorage.removeItem('gantt_mobile_build_status');
                          api.getMobileAppStatus().then((app) => { setMobileAppEnabled(app.enabled); setMobileApkAvailable(!!app.apkAvailable); setMobileIosAvailable(!!app.iosAvailable); }).catch(() => {});
                          modal.showAlert({ title: 'Build complete', message: s.output || 'Build complete.' });
                        }
                      };
                      await poll();
                    } catch (err) {
                      const msg = err instanceof Error ? err.message : 'Unknown error';
                      setMobileBuildStatus({ status: 'failed', message: msg });
                      localStorage.setItem('gantt_mobile_build_status', JSON.stringify({ status: 'failed', message: msg }));
                      adminAlerts.addAlert('Mobile app', 'Build failed', msg);
                      modal.showAlert({ title: 'Build failed', message: 'See Settings → Status for details.' });
                      setMobileBuildInProgress(false);
                    }
                  }}>{mobileBuildInProgress ? 'Building…' : 'Build app now'}</button>
                </div>
                <div className="settings-section">
                  <h5>Admin: iOS build upload</h5>
                  <p className="settings-desc">iOS requires macOS/Xcode. Build the .ipa locally or via CI (e.g. GitHub Actions with macos-latest), then upload it here for distribution.</p>
                  <label className="btn-sm btn-sm-primary" style={{ marginTop: '0.5rem', display: 'inline-block', cursor: iosUploading ? 'not-allowed' : 'pointer' }}>
                    {iosUploading ? 'Uploading…' : 'Upload iOS build (.ipa)'}
                    <input
                      type="file"
                      accept=".ipa,application/octet-stream"
                      style={{ display: 'none' }}
                      disabled={iosUploading}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (!file) return;
                        if (!file.name.toLowerCase().endsWith('.ipa')) {
                          adminAlerts.addAlert('iOS upload', 'Error', 'Please select a .ipa file');
                          modal.showAlert({ title: 'Invalid file', message: 'Only .ipa files are accepted.' });
                          return;
                        }
                        setIosUploading(true);
                        try {
                          const result = await api.uploadIosBuild(file);
                          if (result.ok) {
                            api.getMobileAppStatus().then((s) => { setMobileAppEnabled(s.enabled); setMobileApkAvailable(!!s.apkAvailable); setMobileIosAvailable(!!s.iosAvailable); }).catch(() => {});
                            modal.showAlert({ title: 'Upload complete', message: result.message || 'iOS build uploaded successfully.' });
                          } else {
                            adminAlerts.addAlert('iOS upload', 'Error', result.error || 'Upload failed');
                            modal.showAlert({ title: 'Upload failed', message: result.error || 'Upload failed' });
                          }
                        } catch (err) {
                          const msg = err instanceof Error ? err.message : 'Upload failed';
                          adminAlerts.addAlert('iOS upload', 'Error', msg);
                          modal.showAlert({ title: 'Upload failed', message: msg });
                        } finally {
                          setIosUploading(false);
                        }
                      }}
                    />
                  </label>
                  {mobileIosAvailable && (
                    <p className="settings-desc" style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--success)' }}>iOS build is available. Users can download it from the Mobile app section above.</p>
                  )}
                </div>
              </>
            )}
          </div>
        )}
        {settingsTab === 'status' && (currentUser?.isAdmin || !authEnabled) && (
          <div className="settings-tab-content" role="tabpanel">
            <div className="settings-section">
              <h4>Error status</h4>
              <p className="settings-desc">Recent errors and failures.</p>
              {adminAlerts.alerts.length === 0 ? (
                <p className="settings-desc" style={{ color: 'var(--success)' }}>No errors recorded.</p>
              ) : (
                <>
                  {adminAlerts.alerts.slice().reverse().map((a) => (
                    <div key={a.id} style={{ marginBottom: 12, padding: 12, background: 'rgba(220, 53, 69, 0.1)', border: '1px solid var(--danger)', borderRadius: 'var(--radius)' }}>
                      <div style={{ marginBottom: 4, fontWeight: 600 }}>{a.source} – {a.title}</div>
                      <div style={{ fontSize: '0.85rem' }}>{a.message}</div>
                      <button type="button" className="btn-sm" style={{ marginTop: 8 }} onClick={() => adminAlerts.dismissAlert(a.id)}>Dismiss</button>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        )}
        {settingsTab === 'admin' && currentUser?.isAdmin && (
          <div className="settings-tab-content" role="tabpanel">
            <UserManagementSection
              users={users}
              setUsers={setUsers}
              currentUser={currentUser}
              showUserManagement={showUserManagement}
              setShowUserManagement={setShowUserManagement}
              emailOnboardingSettings={emailOnboardingSettings}
              newUsername={newUsername}
              setNewUsername={setNewUsername}
              newOnboardEmail={newOnboardEmail}
              setNewOnboardEmail={setNewOnboardEmail}
              newManualEmail={newManualEmail}
              setNewManualEmail={setNewManualEmail}
              newTempPassword={newTempPassword}
              setNewTempPassword={setNewTempPassword}
              showCreateManually={showCreateManually}
              setShowCreateManually={setShowCreateManually}
              onboardSending={onboardSending}
              setOnboardPreviewData={setOnboardPreviewData}
              editUserEmailId={editUserEmailId}
              setEditUserEmailId={setEditUserEmailId}
              editUserEmailValue={editUserEmailValue}
              setEditUserEmailValue={setEditUserEmailValue}
              masqueradeUserId={masqueradeUserId}
              setMasqueradeUserId={setMasqueradeUserId}
              userMgmtError={userMgmtError}
              setUserMgmtError={setUserMgmtError}
            />
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
                placeholder="••••••••••••••••"
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
                      placeholder={'Hi {{Username}},\n\nYour account for {{app_domain}} is ready.\n\nYou can log in with:\nUsername: {{Username}}\nPassword: {{password}}\n\n– {{your_name}}\nGantt'}
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
                    <p className="email-var-section-label">Variables for placeholders:</p>
                    <div className="email-compose-vars-grid">
                      <label className="input-label">App domain</label>
                      <input type="text" placeholder="App domain" value={emailOnboardingSettings.email_onboarding_app_domain ?? ''} onChange={(e) => setEmailOnboardingSettings((s) => ({ ...s, email_onboarding_app_domain: e.target.value }))} onBlur={async (e) => { const v = e.target.value; setEmailOnboardingSettings((s) => ({ ...s, email_onboarding_app_domain: v })); setEmailOnboardingSaving(true); try { await api.patchSettings({ email_onboarding_app_domain: v }); } catch (err) { const msg = err instanceof Error ? err.message : 'Failed to save'; adminAlerts.addAlert('Email onboarding', 'Error', msg); modal.showAlert({ title: 'Error', message: msg }); } finally { setEmailOnboardingSaving(false); } }} className="email-var-input" title="{{app_domain}}" />
                      <label className="input-label">Your name</label>
                      <input type="text" placeholder="Your name" value={emailOnboardingSettings.email_onboarding_your_name ?? ''} onChange={(e) => setEmailOnboardingSettings((s) => ({ ...s, email_onboarding_your_name: e.target.value }))} onBlur={async (e) => { const v = e.target.value; setEmailOnboardingSettings((s) => ({ ...s, email_onboarding_your_name: v })); setEmailOnboardingSaving(true); try { await api.patchSettings({ email_onboarding_your_name: v }); } catch (err) { const msg = err instanceof Error ? err.message : 'Failed to save'; adminAlerts.addAlert('Email onboarding', 'Error', msg); modal.showAlert({ title: 'Error', message: msg }); } finally { setEmailOnboardingSaving(false); } }} className="email-var-input" title="{{your_name}}" />
                      <label className="input-label">Login URL</label>
                      <input type="text" placeholder="Login URL" value={emailOnboardingSettings.email_onboarding_login_url ?? ''} onChange={(e) => setEmailOnboardingSettings((s) => ({ ...s, email_onboarding_login_url: e.target.value }))} onBlur={async (e) => { const v = e.target.value; setEmailOnboardingSettings((s) => ({ ...s, email_onboarding_login_url: v })); setEmailOnboardingSaving(true); try { await api.patchSettings({ email_onboarding_login_url: v }); } catch (err) { const msg = err instanceof Error ? err.message : 'Failed to save'; adminAlerts.addAlert('Email onboarding', 'Error', msg); modal.showAlert({ title: 'Error', message: msg }); } finally { setEmailOnboardingSaving(false); } }} className="email-var-input" title="{{login_url}}" />
                    </div>
                    <p className="email-var-required-note">
                      Required in body: {"{{Username}}"}, {"{{password}}"}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="email-template-vars">
                  <p className="settings-desc">Customize variables for the default template.</p>
                  <div className="email-var-grid">
                    <label className="input-label">App domain</label>
                    <input type="text" placeholder="gantt.example.com" value={emailOnboardingSettings.email_onboarding_app_domain ?? ''} onChange={(e) => setEmailOnboardingSettings((s) => ({ ...s, email_onboarding_app_domain: e.target.value }))} onBlur={async (e) => { const v = e.target.value; setEmailOnboardingSettings((s) => ({ ...s, email_onboarding_app_domain: v })); setEmailOnboardingSaving(true); try { await api.patchSettings({ email_onboarding_app_domain: v }); } catch (err) { const msg = err instanceof Error ? err.message : 'Failed to save'; adminAlerts.addAlert('Email onboarding', 'Error', msg); modal.showAlert({ title: 'Error', message: msg }); } finally { setEmailOnboardingSaving(false); } }} className="settings-input" />
                    <label className="input-label">Your name (signature)</label>
                    <input type="text" placeholder="The Team" value={emailOnboardingSettings.email_onboarding_your_name ?? ''} onChange={(e) => setEmailOnboardingSettings((s) => ({ ...s, email_onboarding_your_name: e.target.value }))} onBlur={async (e) => { const v = e.target.value; setEmailOnboardingSettings((s) => ({ ...s, email_onboarding_your_name: v })); setEmailOnboardingSaving(true); try { await api.patchSettings({ email_onboarding_your_name: v }); } catch (err) { const msg = err instanceof Error ? err.message : 'Failed to save'; adminAlerts.addAlert('Email onboarding', 'Error', msg); modal.showAlert({ title: 'Error', message: msg }); } finally { setEmailOnboardingSaving(false); } }} className="settings-input" />
                    <label className="input-label">Login URL</label>
                    <input type="text" placeholder="https://gantt.example.com" value={emailOnboardingSettings.email_onboarding_login_url ?? ''} onChange={(e) => setEmailOnboardingSettings((s) => ({ ...s, email_onboarding_login_url: e.target.value }))} onBlur={async (e) => { const v = e.target.value; setEmailOnboardingSettings((s) => ({ ...s, email_onboarding_login_url: v })); setEmailOnboardingSaving(true); try { await api.patchSettings({ email_onboarding_login_url: v }); } catch (err) { const msg = err instanceof Error ? err.message : 'Failed to save'; adminAlerts.addAlert('Email onboarding', 'Error', msg); modal.showAlert({ title: 'Error', message: msg }); } finally { setEmailOnboardingSaving(false); } }} className="settings-input" />
                    <label className="input-label">Password reset base URL</label>
                    <input type="text" placeholder="Same as login URL if blank" value={emailOnboardingSettings.password_reset_base_url ?? ''} onChange={(e) => setEmailOnboardingSettings((s) => ({ ...s, password_reset_base_url: e.target.value }))} onBlur={async (e) => { const v = e.target.value; setEmailOnboardingSettings((s) => ({ ...s, password_reset_base_url: v })); setEmailOnboardingSaving(true); try { await api.patchSettings({ password_reset_base_url: v }); } catch (err) { const msg = err instanceof Error ? err.message : 'Failed to save'; adminAlerts.addAlert('Email onboarding', 'Error', msg); modal.showAlert({ title: 'Error', message: msg }); } finally { setEmailOnboardingSaving(false); } }} className="settings-input" title="Base URL for password reset links" />
                    <label className="input-label">Subject</label>
                    <input type="text" placeholder="Your Gantt account is ready" value={emailOnboardingSettings.email_onboarding_subject ?? ''} onChange={(e) => setEmailOnboardingSettings((s) => ({ ...s, email_onboarding_subject: e.target.value }))} onBlur={async (e) => { const v = e.target.value; setEmailOnboardingSettings((s) => ({ ...s, email_onboarding_subject: v })); setEmailOnboardingSaving(true); try { await api.patchSettings({ email_onboarding_subject: v }); } catch (err) { const msg = err instanceof Error ? err.message : 'Failed to save'; adminAlerts.addAlert('Email onboarding', 'Error', msg); modal.showAlert({ title: 'Error', message: msg }); } finally { setEmailOnboardingSaving(false); } }} className="settings-input" />
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
            <UpdatesSection
              appVersion={appVersion}
              autoUpdateEnabled={autoUpdateEnabled}
              setAutoUpdateEnabled={setAutoUpdateEnabled}
              updateCheck={updateCheck}
              setUpdateCheck={setUpdateCheck}
              setShowUpdateDebug={setShowUpdateDebug}
              showUpdateDebug={showUpdateDebug}
              normalizeUpdateCheck={normalizeUpdateCheck}
              githubTokenSet={githubTokenSet}
              githubTokenInput={githubTokenInput}
              setGithubTokenInput={setGithubTokenInput}
              githubTokenSaving={githubTokenSaving}
              setGithubTokenSaving={setGithubTokenSaving}
              setGithubTokenSet={setGithubTokenSet}
              applyingUpdate={applyingUpdate}
              setApplyingUpdate={setApplyingUpdate}
              onUpdateApplySucceeded={onUpdateApplySucceeded}
            />
          </div>
        )}
        {settingsTab === 'danger' && (
          <div className="settings-tab-content" role="tabpanel">
            <div className="settings-section danger-zone">
              <h4>Danger zone</h4>
              <p className="settings-desc">Permanently remove all categories, projects, and tasks. This cannot be undone.</p>
              <div className="form-actions" style={{ flexWrap: 'wrap', gap: 8 }}>
                <button type="button" className="btn-danger" onClick={() => setShowClearAllConfirm(true)}>Delete my data</button>
                {currentUser?.isAdmin && (
                  <button type="button" className="btn-danger" onClick={() => { setClearEveryoneError(null); setShowClearEveryoneConfirm(true); }}>Delete everyone&apos;s data</button>
                )}
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="main-view">
      {currentUser?.isAdmin && updateCheck?.updateAvailable && (
        <button
          type="button"
          className="update-available-banner"
          onClick={() => { settingsOpenToTabRef.current = 'updates'; if (isMobile) setMobilePage('settings'); else setShowSettings(true); }}
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
        {!isMobile && (
          <input
            ref={searchInputRef}
            type="search"
            placeholder="Search tasks..."
            value={searchInputValue}
            onChange={(e) => setSearchInputValue(e.target.value)}
            className="header-search-input"
            aria-label="Search tasks"
          />
        )}
        <div className={`header-actions ${isMobile ? 'header-actions-mobile' : ''}`}>
          {isMobile ? (
            <button
              type="button"
              className="btn-sm btn-sm-settings"
              onClick={() => setMobilePage('settings')}
              title="Settings"
              aria-label="Settings"
            >
              <Settings size={20} />
            </button>
          ) : (
            <>
              <button
                className="btn-sm"
                onClick={() => setShowAddTask(true)}
                disabled={projects.length === 0}
                title={projects.length === 0 ? 'Click Categories to add a category and project first' : 'Add task'}
                aria-label={projects.length === 0 ? 'Click Categories to add a category and project first' : 'Add task'}
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

      {isMobile && !isNativeApp && mobileAppEnabled && mobileApkAvailable && !mobileAppPromptDismissed && (
        <div className="mobile-app-prompt-banner" role="status">
          <span>Use our mobile app for a better experience.</span>
          <div className="mobile-app-prompt-actions">
            <button type="button" className="btn-sm btn-sm-primary" onClick={handleDownloadApk}>Download app</button>
            <button type="button" className="btn-sm" onClick={() => { localStorage.setItem('gantt_mobile_app_prompt_dismissed', '1'); setMobileAppPromptDismissed(true); }}>Dismiss</button>
          </div>
        </div>
      )}

      {isNativeApp && mobileAppUpdateAvailable && (
        <div className="mobile-app-prompt-banner mobile-app-update-banner" role="status">
          <span>App update available.</span>
          <button type="button" className="btn-sm btn-sm-primary" onClick={handleDownloadApk}>Update app</button>
        </div>
      )}

      <div className={`main-body ${isMobile ? 'main-body-mobile' : ''}`}>
        {isMobile ? (
          <PullToRefresh onRefresh={refreshAll} className="mobile-page-container">
            {mobilePage === 'chart' && (
              <main className="gantt-area">
                <GanttChart
                  tasks={filteredTasks}
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
                onTaskEdit={(t) => { setEditTask(t); setMobilePage('add-task'); }}
                onTaskReorder={async (updates) => { await api.reorderTasks(updates); load(); }}
                forceViewMode="chart"
                />
              </main>
            )}
            {mobilePage === 'list' && (
              <main className="gantt-area">
                <GanttChart
                  tasks={filteredTasks}
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
                  onTaskEdit={(t) => { setEditTask(t); setMobilePage('add-task'); }}
                  onTaskReorder={async (updates) => { await api.reorderTasks(updates); load(); }}
                  forceViewMode="list"
                />
              </main>
            )}
            {mobilePage === 'categories' && (
              <CategoriesPage
                categories={categories}
                projects={projects}
                editCategory={editCategory}
                editProject={editProject}
                onAddCategory={handleCreateCategory}
                onAddProject={handleCreateProject}
                onUpdateCategory={handleUpdateCategory}
                onUpdateProject={handleUpdateProject}
                onRequestDeleteCategory={(c) => setDeleteCategoryConfirm(c)}
                onRequestDeleteProject={(p) => setDeleteProjectConfirm(p)}
                onEditCategory={setEditCategory}
                onEditProject={setEditProject}
                showAddForm={showAddForm}
                onShowAddForm={setShowAddForm}
              />
            )}
            {mobilePage === 'add-task' && (
              <TaskForm
                categories={categories}
                projects={projects}
                task={editTask}
                onClose={() => { setEditTask(null); setMobilePage('chart'); }}
                onCreate={handleCreateTask}
                onUpdate={editTask ? handleUpdateTask : undefined}
                embedded
              />
            )}
            {mobilePage === 'completed' && (
              <CompletedTasks
                onClose={() => setMobilePage('chart')}
                onComplete={(id) => handleUpdateTask(id, { completed: false })}
                onDelete={handleDeleteTask}
                embedded
              />
            )}
            {mobilePage === 'settings' && (
              <SettingsPage
                tab={settingsTab}
                onTabChange={(t) => { setSettingsTab(t); settingsOpenToTabRef.current = t; }}
                sections={[
                  { id: 'personal', label: 'Personal' },
                  { id: 'app', label: 'App', show: !!(mobileAppEnabled || currentUser?.isAdmin || !authEnabled) },
                  { id: 'status', label: 'Status', show: !!(currentUser?.isAdmin || !authEnabled) },
                  { id: 'admin', label: 'Admin', show: !!currentUser?.isAdmin },
                  { id: 'emailOnboarding', label: 'Email invite', show: !!currentUser?.isAdmin },
                  { id: 'updates', label: 'Updates', show: !!currentUser?.isAdmin },
                  { id: 'danger', label: 'Danger zone' },
                ]}
              >
                {renderSettingsTabContent()}
              </SettingsPage>
            )}
          </PullToRefresh>
        ) : (
          <>
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
                tasks={filteredTasks}
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
                onTaskReorder={async (updates) => { await api.reorderTasks(updates); load(); }}
              />
            </main>
          </>
        )}
      </div>

      {isMobile && (
        <BottomNav
          currentPage={mobilePage}
          onPageChange={setMobilePage}
          projectsLength={projects.length}
        />
      )}

      {(showAddTask || editTask) && !isMobile && (
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

      {showCompleted && !isMobile && (
        <CompletedTasks
          onClose={() => setShowCompleted(false)}
          onComplete={(id) => handleUpdateTask(id, { completed: false })}
          onDelete={handleDeleteTask}
        />
      )}

      {showCatProj && !isMobile && (
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

      {showShortcutsHelp && (
        <ShortcutsHelpModal onClose={() => setShowShortcutsHelp(false)} />
      )}

      {showSettings && !isMobile && (
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
            {renderSettingsTabContent()}
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
