import { clearCredentials, getCredentials, isMobileNative } from './credentialStorage';

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const API = API_BASE ? `${API_BASE}/api` : '/api';

/** URL for APK download - under /api so it bypasses SPA static/catch-all. */
export const APK_DOWNLOAD_URL = API_BASE ? `${API_BASE}/api/mobile-app/download` : '/api/mobile-app/download';

/** URL for iOS build download */
export const IOS_DOWNLOAD_URL = API_BASE ? `${API_BASE}/api/mobile-app/download-ios` : '/api/mobile-app/download-ios';

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.includes(',') ? result.split(',')[1] : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/** Download APK. On native: Filesystem.downloadFile + FileOpener, fallback to fetch+write. On web: fetch, validate, trigger download. No auth needed (app requires sign-in). */
export async function downloadApk(): Promise<void> {
  const url = `${API}/mobile-app/download`;
  const absUrl = url.startsWith('http') ? url : `${window.location.origin}${url.startsWith('/') ? '' : '/'}${url}`;
  if (isMobileNative()) {
    if (!absUrl.startsWith('https://') && !absUrl.startsWith('http://')) {
      throw new Error('Server URL not configured. Rebuild the app with PUBLIC_URL set in .env.');
    }
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const { FileOpener } = await import('@capacitor-community/file-opener');
    const { Browser } = await import('@capacitor/browser');
    try {
      try {
        await Promise.race([
          Filesystem.downloadFile({ url: absUrl, path: 'gantt-chart.apk', directory: Directory.Cache }),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Download timeout')), 60000)),
        ]);
      } catch {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000);
        const res = await fetch(absUrl, { credentials: 'same-origin', signal: controller.signal });
        clearTimeout(timeoutId);
        const ct = (res.headers.get('Content-Type') || '').toLowerCase();
        if (ct.includes('text/html') || ct.includes('application/json')) {
          const text = await res.text();
          throw new Error(
            res.ok
              ? 'Server returned HTML instead of APK. Check proxy/base path configuration.'
              : `Download failed (${res.status}): ${text.slice(0, 200)}`
          );
        }
        if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`);
        const blob = await res.blob();
        const base64 = await blobToBase64(blob);
        await Filesystem.writeFile({ path: 'gantt-chart.apk', data: base64, directory: Directory.Cache });
      }
      const { uri } = await Filesystem.getUri({ path: 'gantt-chart.apk', directory: Directory.Cache });
      const openPromise = FileOpener.open({ filePath: uri, contentType: 'application/vnd.android.package-archive', openWithDefault: true });
      await Promise.race([openPromise, new Promise<void>((resolve) => setTimeout(resolve, 3000))]);
    } catch {
      await Browser.open({ url: absUrl });
      return;
    }
    return;
  }
  const res = await fetch(url, { credentials: 'same-origin' });
  const ct = (res.headers.get('Content-Type') || '').toLowerCase();
  if (ct.includes('text/html') || ct.includes('application/json')) {
    const text = await res.text();
    throw new Error(
      res.ok
        ? 'Server returned HTML instead of APK. Check proxy/base path configuration.'
        : `Download failed (${res.status}): ${text.slice(0, 200)}`
    );
  }
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`);
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'gantt-chart.apk';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

/** Download iOS build (.ipa). On native: Filesystem.downloadFile + FileOpener, fallback to fetch+write. On web: fetch, validate, trigger download. No auth needed (app requires sign-in). */
export async function downloadIosBuild(): Promise<void> {
  const url = `${API}/mobile-app/download-ios`;
  const absUrl = url.startsWith('http') ? url : `${window.location.origin}${url.startsWith('/') ? '' : '/'}${url}`;
  if (isMobileNative()) {
    if (!absUrl.startsWith('https://') && !absUrl.startsWith('http://')) {
      throw new Error('Server URL not configured. Rebuild the app with PUBLIC_URL set in .env.');
    }
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const { FileOpener } = await import('@capacitor-community/file-opener');
    const { Browser } = await import('@capacitor/browser');
    try {
      try {
        await Promise.race([
          Filesystem.downloadFile({ url: absUrl, path: 'gantt-chart.ipa', directory: Directory.Cache }),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Download timeout')), 60000)),
        ]);
      } catch {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000);
        const res = await fetch(absUrl, { credentials: 'same-origin', signal: controller.signal });
        clearTimeout(timeoutId);
        const ct = (res.headers.get('Content-Type') || '').toLowerCase();
        if (ct.includes('text/html') || ct.includes('application/json')) {
          const text = await res.text();
          throw new Error(
            res.ok
              ? 'Server returned HTML instead of IPA. Check proxy/base path configuration.'
              : `Download failed (${res.status}): ${text.slice(0, 200)}`
          );
        }
        if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`);
        const blob = await res.blob();
        const base64 = await blobToBase64(blob);
        await Filesystem.writeFile({ path: 'gantt-chart.ipa', data: base64, directory: Directory.Cache });
      }
      const { uri } = await Filesystem.getUri({ path: 'gantt-chart.ipa', directory: Directory.Cache });
      const openPromise = FileOpener.open({ filePath: uri, contentType: 'application/octet-stream', openWithDefault: true });
      await Promise.race([openPromise, new Promise<void>((resolve) => setTimeout(resolve, 3000))]);
    } catch {
      await Browser.open({ url: absUrl });
      return;
    }
    return;
  }
  const res = await fetch(url, { credentials: 'same-origin' });
  const ct = (res.headers.get('Content-Type') || '').toLowerCase();
  if (ct.includes('text/html') || ct.includes('application/json')) {
    const text = await res.text();
    throw new Error(
      res.ok
        ? 'Server returned HTML instead of IPA. Check proxy/base path configuration.'
        : `Download failed (${res.status}): ${text.slice(0, 200)}`
    );
  }
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`);
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'gantt-chart.ipa';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

/** Upload iOS build (.ipa) - admin only */
export async function uploadIosBuild(file: File): Promise<{ ok: boolean; message?: string; error?: string }> {
  const formData = new FormData();
  formData.append('file', file);
  const token = localStorage.getItem('gantt_token');
  const res = await fetch(`${API}/admin/upload-ios-build`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: data.error || `Upload failed (${res.status})` };
  }
  return { ok: true, message: data.message };
}

/** Parse response as JSON, or throw a user-friendly error when body is empty/invalid (e.g. HTML error page) */
async function safeJson<T = unknown>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text || !text.trim()) {
    throw new Error(res.ok ? 'Server returned empty response' : `Request failed (${res.status} ${res.statusText})`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(
      res.ok
        ? 'Server returned invalid response'
        : `Request failed (${res.status} ${res.statusText}). Response may be an error page.`
    );
  }
}

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('gantt_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function fetchApi(path: string, opts: RequestInit = {}) {
  let res = await fetch(`${API}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders(), ...opts.headers },
  });
  if (res.status === 401 && isMobileNative()) {
    const creds = await getCredentials();
    if (creds) {
      try {
        const data = await login(creds.username, creds.password);
        if (data.token) {
          res = await fetch(`${API}${path}`, {
            ...opts,
            headers: { 'Content-Type': 'application/json', ...getAuthHeaders(), ...opts.headers },
          });
          if (res.status === 401) {
            await clearCredentials();
            localStorage.removeItem('gantt_token');
            window.location.reload();
          }
          return res;
        }
      } catch {
        /* fall through */
      }
    }
    await clearCredentials();
    localStorage.removeItem('gantt_token');
    window.location.reload();
  } else if (res.status === 401) {
    localStorage.removeItem('gantt_token');
    window.location.reload();
  }
  return res;
}

export async function getAuthStatus() {
  const res = await fetch(`${API}/auth/status`);
  return res.json();
}

export async function getLoginHash(username: string): Promise<{ hash: string }> {
  const res = await fetch(`${API}/auth/login-hash?username=${encodeURIComponent(username)}`);
  return res.json();
}

export async function login(username: string, password: string) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json();
  if (data.token) localStorage.setItem('gantt_token', data.token);
  return data;
}

export async function requestPasswordReset(email: string): Promise<{ message: string }> {
  const res = await fetch(`${API}/auth/password-reset-request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to request reset');
  return data;
}

export async function resetPassword(token: string, newPassword: string): Promise<{ ok: boolean; message: string }> {
  const res = await fetch(`${API}/auth/password-reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, new_password: newPassword }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to reset password');
  return data;
}

export async function changePassword(currentPassword: string, newPassword: string) {
  const res = await fetchApi('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to change password');
  return data;
}

export type MeResponse = {
  id: number;
  username: string;
  isAdmin: boolean;
  apiKey: string | null;
  createdAt?: string;
  email?: string;
  mustChangePassword?: boolean;
};

export async function getMe(): Promise<MeResponse> {
  const res = await fetchApi('/users/me');
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to get user');
  return data;
}

export async function getUserPreferences() {
  const res = await fetchApi('/user-preferences');
  return res.json();
}

export async function patchUserPreferences(key: string, value: unknown) {
  const res = await fetchApi('/user-preferences', {
    method: 'PATCH',
    body: JSON.stringify({ key, value }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to save preferences');
  return data;
}

export async function getUsers() {
  const res = await fetchApi('/users');
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to get users');
  return data;
}

export async function createUser(username: string, temporaryPassword: string, email?: string) {
  const res = await fetchApi('/users', {
    method: 'POST',
    body: JSON.stringify({ username, temporaryPassword, email: email || undefined }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to create user');
  return data;
}

export async function updateUser(id: number, data: {
  password?: string;
  currentPassword?: string;
  isActive?: boolean;
  revokeApiKey?: boolean;
  regenerateApiKey?: boolean;
  email?: string | null;
}) {
  const res = await fetchApi(`/users/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  const out = await res.json();
  if (!res.ok) throw new Error(out.error || 'Failed to update user');
  return out;
}

export async function deleteUser(id: number) {
  const res = await fetchApi(`/users/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to delete user');
  }
}

export async function masquerade(userId: number) {
  const res = await fetchApi('/auth/masquerade', {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Masquerade failed');
  if (data.token) {
    const prev = localStorage.getItem('gantt_token');
    if (prev) localStorage.setItem('gantt_token_admin', prev);
    localStorage.setItem('gantt_token', data.token);
  }
  return data;
}

export function stopMasquerade(): void {
  const adminToken = localStorage.getItem('gantt_token_admin');
  if (!adminToken) return;
  localStorage.setItem('gantt_token', adminToken);
  localStorage.removeItem('gantt_token_admin');
  window.location.reload();
}

export async function getAdminFullBackup(): Promise<Blob> {
  const res = await fetchApi('/admin/full-backup');
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Failed to fetch full backup (${res.status})`);
  }
  return res.blob();
}

export async function getVersion(): Promise<{ version: string; updating?: boolean; bootId?: string }> {
  const res = await fetch(`${API}/version?_t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Version check failed: ${res.status}`);
  return res.json();
}

/** Compare semver strings; returns 1 if a>b, -1 if a<b, 0 if equal */
export function compareVersions(a: string, b: string): number {
  const normalize = (v: string) =>
    (v || '0').replace(/^[vV]+/, '').replace(/^[^0-9.]+/, '') || '0.0.0';
  const parts = (v: string) => normalize(v).split('.').map((n) => parseInt(n, 10) || 0);
  const pa = parts(a);
  const pb = parts(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

export async function getMobileAppStatus(): Promise<{ enabled: boolean; apkAvailable?: boolean; iosAvailable?: boolean }> {
  const base = API_BASE || '';
  const url = base ? `${base}/api/mobile-app/status` : '/api/mobile-app/status';
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to get mobile app status');
  return data;
}

/** Start mobile build (returns immediately; poll getMobileBuildStatus for progress) */
export async function startMobileBuild(): Promise<{ ok: boolean; status?: string; error?: string }> {
  const res = await fetchApi('/admin/build-mobile', { method: 'POST' });
  const data = await safeJson<{ ok?: boolean; status?: string; error?: string }>(res);
  if (!res.ok) {
    return { ok: false, error: data.error || 'Failed to start build' };
  }
  return { ok: data.ok ?? true, status: data.status };
}

/** Get mobile build status (for polling after startMobileBuild) */
export async function getMobileBuildStatus(): Promise<{
  status: 'idle' | 'building' | 'success' | 'failed';
  output?: string;
  error?: string | null;
  ok: boolean;
}> {
  const res = await fetchApi('/admin/build-mobile/status');
  const data = await res.json();
  return {
    status: data.status ?? 'idle',
    output: data.output,
    error: data.error,
    ok: data.ok ?? data.status === 'success',
  };
}

export async function getSettings() {
  const res = await fetchApi('/settings');
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to get settings');
  return data;
}

export async function patchSettings(data: Record<string, unknown>) {
  const res = await fetchApi('/settings', {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  const out = await res.json();
  if (!res.ok) throw new Error(out.error || 'Failed to save settings');
  return out;
}

export type EmailOnboardingSettings = {
  email_onboarding_enabled?: boolean;
  email_onboarding_use_default_template?: boolean;
  email_onboarding_api_key?: string;
  email_onboarding_region?: 'us' | 'eu';
  email_onboarding_domain?: string;
  email_onboarding_sending_username?: string;
  email_onboarding_app_domain?: string;
  email_onboarding_your_name?: string;
  email_onboarding_login_url?: string;
  password_reset_base_url?: string;
  email_onboarding_subject?: string;
  email_onboarding_template?: string;
};

export async function getEmailOnboardingSettings(): Promise<EmailOnboardingSettings> {
  const settings = await getSettings();
  const keys = [
    'email_onboarding_enabled', 'email_onboarding_use_default_template', 'email_onboarding_api_key',
    'email_onboarding_region', 'email_onboarding_domain', 'email_onboarding_sending_username',
    'email_onboarding_app_domain', 'email_onboarding_your_name', 'email_onboarding_login_url',
    'password_reset_base_url', 'email_onboarding_subject', 'email_onboarding_template',
  ];
  const out: EmailOnboardingSettings = {};
  for (const k of keys) {
    if (settings[k] !== undefined) out[k as keyof EmailOnboardingSettings] = settings[k];
  }
  return out;
}

export async function patchEmailOnboardingSettings(data: EmailOnboardingSettings) {
  return patchSettings(data);
}

export async function previewOnboardEmail(username: string) {
  const res = await fetchApi('/admin/preview-onboard-email', {
    method: 'POST',
    body: JSON.stringify({ username }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to preview email');
  return data as { subject: string; body: string };
}

export async function onboardUser(email: string, username: string) {
  const res = await fetchApi('/admin/onboard-user', {
    method: 'POST',
    body: JSON.stringify({ email, username }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to onboard user');
  return data as {
    user: { id: number; username: string; isAdmin: boolean; apiKey: string | null; createdAt: string };
    mailgunResponse: { statusCode: number; status: string; body: unknown };
  };
}

export async function sendTestOnboardEmail(toEmail: string) {
  const res = await fetchApi('/admin/test-onboard-email', {
    method: 'POST',
    body: JSON.stringify({ to: toEmail }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to send test email');
  return data as { mailgunResponse: { statusCode: number; status: string; body: unknown } };
}

export async function checkUpdate(debug = false) {
  const url = debug ? '/admin/update/check-update?debug=1' : '/admin/update/check-update';
  const res = await fetchApi(url);
  const data = await safeJson<{ error?: string; updateAvailable?: boolean; currentVersion?: string; latestVersion?: string; releaseName?: string; releaseUrl?: string; _debug?: unknown }>(res);
  if (!res.ok) throw new Error(data.error || 'Failed to check for updates');
  return data;
}

export async function applyUpdate(debug = false) {
  const url = debug ? '/admin/update/apply-update?debug=1' : '/admin/update/apply-update';
  const res = await fetchApi(url, { method: 'POST' });
  const data = await safeJson<{ error?: string; ok?: boolean; message?: string }>(res);
  if (!res.ok) throw new Error(data.error || 'Failed to apply update');
  return data;
}

export async function getCategories() {
  const res = await fetchApi('/categories');
  return res.json();
}

export async function createCategory(name: string) {
  const res = await fetchApi('/categories', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
  return res.json();
}

export async function updateCategory(id: number, data: { name?: string; display_order?: number }) {
  const res = await fetchApi(`/categories/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  const dataOut = await res.json();
  if (!res.ok) throw new Error((dataOut as { error?: string }).error || 'Failed to update category');
  return dataOut;
}

export async function deleteCategory(id: number) {
  const res = await fetchApi(`/categories/${id}`, { method: 'DELETE' });
  return res.json();
}

export async function getProjects() {
  const res = await fetchApi('/projects');
  return res.json();
}

export async function createProject(name: string, categoryId: number, dueDate?: string, startDate?: string) {
  const res = await fetchApi('/projects', {
    method: 'POST',
    body: JSON.stringify({ name, category_id: categoryId, due_date: dueDate || null, start_date: startDate || null }),
  });
  return res.json();
}

export async function updateProject(id: number, data: { name?: string; category_id?: number; due_date?: string | null; start_date?: string | null }) {
  const res = await fetchApi(`/projects/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  const dataOut = await res.json();
  if (!res.ok) throw new Error((dataOut as { error?: string }).error || 'Failed to update project');
  return dataOut;
}

export async function deleteProject(id: number) {
  const res = await fetchApi(`/projects/${id}`, { method: 'DELETE' });
  return res.json();
}

export async function getTasks(includeCompleted = false) {
  const q = includeCompleted ? '?include_completed=true' : '';
  const res = await fetchApi(`/tasks${q}`);
  return res.json();
}

export async function getCompletedTasks() {
  const res = await fetchApi('/tasks/completed');
  return res.json();
}

export async function createTask(data: {
  project_id: number;
  parent_id?: number;
  name: string;
  start_date: string;
  end_date: string;
  due_date?: string;
  base_priority?: number;
}) {
  const res = await fetchApi('/tasks', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function updateTask(id: number, data: Partial<{
  project_id: number;
  name: string;
  start_date: string;
  end_date: string;
  due_date: string;
  progress: number;
  completed: boolean;
  base_priority: number;
  display_order: number;
}>) {
  const res = await fetchApi(`/tasks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function reorderTasks(updates: { id: number; display_order: number }[]) {
  const res = await fetchApi('/tasks/reorder', {
    method: 'PATCH',
    body: JSON.stringify({ updates }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error((data as { error?: string }).error || 'Failed to reorder tasks');
  return data;
}

export async function splitTask(id: number, subtasks: { name: string; start_date: string; end_date: string }[]) {
  const res = await fetchApi(`/tasks/split/${id}`, {
    method: 'POST',
    body: JSON.stringify({ subtasks }),
  });
  return res.json();
}

export async function deleteTask(id: number, cascade = false) {
  const res = await fetchApi(`/tasks/${id}?cascade=${cascade}`, { method: 'DELETE' });
  return res.json();
}

export async function getGanttExpanded() {
  const res = await fetchApi('/gantt-expanded');
  return res.json();
}

export async function setGanttExpanded(
  itemType: 'category' | 'project' | 'task',
  itemId: number,
  expanded: boolean
) {
  const res = await fetchApi('/gantt-expanded', {
    method: 'PATCH',
    body: JSON.stringify({ item_type: itemType, item_id: itemId, expanded }),
  });
  return res.json();
}

export async function clearAllData() {
  const res = await fetchApi('/clear', { method: 'DELETE' });
  return res.json();
}

export async function clearAllDataEveryone(password: string): Promise<{ ok: boolean; message: string }> {
  const res = await fetch(`${API}/admin/clear-all-data`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Failed to clear all data');
  }
  return data;
}

export async function getBackupData(): Promise<Record<string, unknown>> {
  const res = await fetchApi('/backup');
  if (!res.ok) throw new Error('Failed to fetch backup');
  return res.json();
}

export async function restoreBackup(data: Record<string, unknown>): Promise<void> {
  const res = await fetchApi('/backup', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to restore backup');
  }
}
