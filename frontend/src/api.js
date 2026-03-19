const BASE_URL = 'http://localhost:8000/api';

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const config = {
    headers: {
      'Content-Type': 'application/json',
    },
    ...options,
  };

  const response = await fetch(url, config);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(error.detail || `Request failed: ${response.status}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

// Initiatives
export function getInitiatives(status, category) {
  const params = new URLSearchParams();
  if (status) params.append('status', status);
  if (category) params.append('category', category);
  const query = params.toString();
  return request(`/initiatives${query ? `?${query}` : ''}`);
}

export function getInitiative(id) {
  return request(`/initiatives/${id}`);
}

export function createInitiative(data) {
  return request('/initiatives', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateInitiative(id, data) {
  return request(`/initiatives/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function updateStatus(id, status, user = 'user') {
  return request(`/initiatives/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status, user }),
  });
}

export function deleteInitiative(id) {
  return request(`/initiatives/${id}`, {
    method: 'DELETE',
  });
}

// Metrics
export function addMetric(initiativeId, data) {
  return request(`/initiatives/${initiativeId}/metrics`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateMetric(id, data) {
  return request(`/metrics/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function deleteMetric(id) {
  return request(`/metrics/${id}`, {
    method: 'DELETE',
  });
}

// Dashboard
export function getDashboardSummary() {
  return request('/dashboard/summary');
}

export function getDashboardTimeline() {
  return request('/dashboard/timeline');
}

export function getTopImprovements() {
  return request('/dashboard/top-improvements');
}

// Claude Projects
export function getClaudeProjects() {
  return request('/claude/projects');
}

export async function getClaudeSessions() {
  const data = await request('/claude/sessions');
  const hour = data.most_active_hour;
  const mostActiveHour = hour != null
    ? `${hour % 12 || 12} ${hour >= 12 ? 'PM' : 'AM'}`
    : null;
  return {
    totalSessions: data.total_sessions,
    totalMessages: data.total_messages,
    streakDays: data.streak_days,
    mostActiveHour,
    days: data.daily_activity,
  };
}

export function getClaudeBacklog() {
  return request('/claude/backlog');
}

export function syncClaudeProjects() {
  return request('/claude/sync', { method: 'POST' });
}
export function createClaudeTodo(slug, data) {
  return request(`/claude/projects/${slug}/todos`, { method: 'POST', body: JSON.stringify(data) });
}
export function toggleClaudeTodo(todoId) {
  return request(`/claude/todos/${todoId}/toggle`, { method: 'PATCH' });
}
export function deleteClaudeTodo(todoId) {
  return request(`/claude/todos/${todoId}`, { method: 'DELETE' });
}
export function startClaudeTimer(projectSlug, notes) {
  return request('/claude/time/start', { method: 'POST', body: JSON.stringify({ project_slug: projectSlug, notes: notes || null }) });
}
export function stopClaudeTimer(notes) {
  return request('/claude/time/stop', { method: 'POST', body: JSON.stringify({ notes: notes || null }) });
}
export function getClaudeActiveTimer() {
  return request('/claude/time/active');
}
export function getClaudeTimeSummary(slug) {
  return request(`/claude/time/${slug}/summary`);
}

export function registerClaudeProject(data) {
  return request('/claude/projects/register', { method: 'POST', body: JSON.stringify(data) });
}

export function unregisterClaudeProject(slug) {
  return request(`/claude/projects/register/${slug}`, { method: 'DELETE' });
}

export function getClaudeProjectSessions(slug, limit = 10) {
  return request(`/claude/projects/${slug}/sessions?limit=${limit}`);
}

export function getClaudeStatsSummary() {
  return request('/claude/stats/summary');
}

export function getClaudeCosts() {
  return request('/claude/costs');
}

export function getDashboardOverview() {
  return request('/dashboard/overview');
}

// Work Projects
export function getWorkProjects() {
  return request('/work/projects');
}
export function createTodo(initiativeId, data) {
  return request(`/work/${initiativeId}/todos`, { method: 'POST', body: JSON.stringify(data) });
}
export function updateTodo(todoId, data) {
  return request(`/work/todos/${todoId}`, { method: 'PATCH', body: JSON.stringify(data) });
}
export function toggleTodo(todoId) {
  return request(`/work/todos/${todoId}/toggle`, { method: 'PATCH' });
}
export function deleteTodo(todoId) {
  return request(`/work/todos/${todoId}`, { method: 'DELETE' });
}
export function startTimer(initiativeId, notes) {
  return request('/work/time/start', { method: 'POST', body: JSON.stringify({ initiative_id: initiativeId, notes }) });
}
export function stopTimer(notes) {
  return request('/work/time/stop', { method: 'POST', body: JSON.stringify({ notes: notes || null }) });
}
export function getActiveTimer() {
  return request('/work/time/active');
}
export function getTimeSummary(initiativeId) {
  return request(`/work/time/${initiativeId}/summary`);
}
export function getWorkStats() {
  return request('/work/stats');
}
