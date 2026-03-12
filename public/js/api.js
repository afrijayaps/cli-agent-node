async function parseJsonSafe(response) {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch (_error) {
    return {};
  }
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  const body = await parseJsonSafe(response);

  if (!response.ok) {
    const details = typeof body.details === 'string' ? body.details : 'Request failed.';
    const error = new Error(details);
    error.status = response.status;
    error.body = body;
    throw error;
  }

  return body;
}

export const api = {
  getMeta() {
    return request('/api/meta');
  },
  getSettings() {
    return request('/api/settings');
  },
  updateSettings(payload) {
    return request('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },
  getProjects() {
    return request('/api/projects');
  },
  createProject(payload) {
    return request('/api/projects', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  getSessions(projectId) {
    return request(`/api/projects/${encodeURIComponent(projectId)}/sessions`);
  },
  createSession(projectId, payload) {
    return request(`/api/projects/${encodeURIComponent(projectId)}/sessions`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  getSession(projectId, sessionId) {
    return request(
      `/api/projects/${encodeURIComponent(projectId)}/sessions/${encodeURIComponent(sessionId)}`,
    );
  },
  askInSession(projectId, sessionId, payload) {
    return request(
      `/api/projects/${encodeURIComponent(projectId)}/sessions/${encodeURIComponent(sessionId)}/ask`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
  },
};
