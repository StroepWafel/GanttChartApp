const API = '/api';

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('gantt_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function fetchApi(path: string, opts: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders(), ...opts.headers },
  });
  if (res.status === 401) {
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

export async function changePassword(currentPassword: string, newPassword: string) {
  const res = await fetchApi('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to change password');
  return data;
}

export async function getMe() {
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
  if (data.token) localStorage.setItem('gantt_token', data.token);
  return data;
}

export async function getAdminFullBackup(): Promise<Blob> {
  const res = await fetchApi('/admin/full-backup');
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Failed to fetch full backup (${res.status})`);
  }
  return res.blob();
}

export async function getVersion() {
  const res = await fetch(`${API}/version`);
  return res.json();
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
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to check for updates');
  return data;
}

export async function applyUpdate(debug = false) {
  const url = debug ? '/admin/update/apply-update?debug=1' : '/admin/update/apply-update';
  const res = await fetchApi(url, { method: 'POST' });
  const data = await res.json();
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
  return res.json();
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
  return res.json();
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
}>) {
  const res = await fetchApi(`/tasks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  return res.json();
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
