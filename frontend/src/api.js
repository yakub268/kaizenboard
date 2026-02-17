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

export function updateStatus(id, status) {
  return request(`/initiatives/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
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
