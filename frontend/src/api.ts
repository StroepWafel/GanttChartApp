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

export async function login(email: string, password: string) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (data.token) localStorage.setItem('gantt_token', data.token);
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

export async function getProjects() {
  const res = await fetchApi('/projects');
  return res.json();
}

export async function createProject(name: string, categoryId: number) {
  const res = await fetchApi('/projects', {
    method: 'POST',
    body: JSON.stringify({ name, category_id: categoryId }),
  });
  return res.json();
}

export async function updateProject(id: number, data: { name?: string; category_id?: number }) {
  const res = await fetchApi(`/projects/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
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

export async function clearAllData() {
  const res = await fetchApi('/clear', { method: 'DELETE' });
  return res.json();
}
