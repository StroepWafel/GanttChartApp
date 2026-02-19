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

export async function createUser(username: string, temporaryPassword: string) {
  const res = await fetchApi('/users', {
    method: 'POST',
    body: JSON.stringify({ username, temporaryPassword }),
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
}) {
  const res = await fetchApi(`/users/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  const out = await res.json();
  if (!res.ok) throw new Error(out.error || 'Failed to update user');
  return out;
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

export async function checkUpdate() {
  const res = await fetchApi('/admin/update/check-update');
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to check for updates');
  return data;
}

export async function applyUpdate() {
  const res = await fetchApi('/admin/update/apply-update', { method: 'POST' });
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
