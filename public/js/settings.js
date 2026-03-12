import { api } from './api.js';
import { applyTheme, THEME_PREVIEWS } from './theme.js';

const els = {
  masterRootForm: document.getElementById('masterRootForm'),
  masterRootInput: document.getElementById('masterRootInput'),
  themeGrid: document.getElementById('themeGrid'),
  status: document.getElementById('settingsStatus'),
  providerList: document.getElementById('providerList'),
  projectSelect: document.getElementById('settingsProjectSelect'),
  sessionForm: document.getElementById('settingsSessionForm'),
  sessionTitle: document.getElementById('settingsSessionTitle'),
  sessionList: document.getElementById('settingsSessionList'),
  restartServerButton: document.getElementById('restartServerButton'),
};

const state = {
  themes: [],
  providers: [],
  currentTheme: 'aether',
  masterProjectRoot: '',
  projects: [],
  sessions: [],
  activeProjectId: '',
  activeSessionId: '',
  busy: false,
};

function setStatus(message, isError = false) {
  els.status.textContent = `Status: ${message}`;
  els.status.classList.toggle('error', isError);
}

function renderThemes() {
  els.themeGrid.innerHTML = '';

  for (const theme of state.themes) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `theme-card${theme.id === state.currentTheme ? ' active' : ''}`;
    card.dataset.themeId = theme.id;

    const preview = document.createElement('div');
    preview.className = 'theme-preview';
    preview.style.background = THEME_PREVIEWS[theme.id] || 'var(--surface-soft)';

    const name = document.createElement('div');
    name.style.fontWeight = '700';
    name.style.marginBottom = '6px';
    name.textContent = theme.name;

    const desc = document.createElement('div');
    desc.className = 'small';
    desc.textContent = theme.description;

    card.append(preview, name, desc);
    card.addEventListener('click', () => selectTheme(theme.id));
    els.themeGrid.appendChild(card);
  }
}

function renderProjectSelect() {
  if (!els.projectSelect) {
    return;
  }

  els.projectSelect.innerHTML = '';

  if (state.projects.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No project yet';
    els.projectSelect.appendChild(option);
    els.projectSelect.value = '';
    els.projectSelect.disabled = true;
    return;
  }

  els.projectSelect.disabled = false;

  for (const project of state.projects) {
    const option = document.createElement('option');
    option.value = project.id;
    option.textContent = project.name;
    els.projectSelect.appendChild(option);
  }

  if (!state.activeProjectId || !state.projects.some((project) => project.id === state.activeProjectId)) {
    state.activeProjectId = state.projects[0].id;
  }

  els.projectSelect.value = state.activeProjectId;
}

function renderSessionList() {
  if (!els.sessionList) {
    return;
  }

  els.sessionList.innerHTML = '';

  if (state.sessions.length === 0) {
    const item = document.createElement('li');
    item.className = 'small';
    item.textContent = 'No session yet';
    els.sessionList.appendChild(item);
    return;
  }

  for (const session of state.sessions) {
    const item = document.createElement('li');
    item.className = `session-item enter${session.id === state.activeSessionId ? ' active' : ''}`;
    item.dataset.sessionId = session.id;

    const title = document.createElement('div');
    title.className = 'session-title';
    title.textContent = session.title;

    item.appendChild(title);
    item.addEventListener('click', () => selectSession(session.id));
    els.sessionList.appendChild(item);
  }
}

async function loadSessions(projectId) {
  if (!projectId) {
    state.sessions = [];
    state.activeSessionId = '';
    renderSessionList();
    return;
  }

  const data = await api.getSessions(projectId);
  state.sessions = data.sessions || [];

  const stored = localStorage.getItem(`activeSessionId:${projectId}`);
  if (stored && state.sessions.some((session) => session.id === stored)) {
    state.activeSessionId = stored;
  } else {
    state.activeSessionId = state.sessions[0] ? state.sessions[0].id : '';
  }

  renderSessionList();
}

async function loadProjects() {
  const data = await api.getProjects();
  state.projects = data.projects || [];

  const stored = localStorage.getItem('activeProjectId');
  if (stored && state.projects.some((project) => project.id === stored)) {
    state.activeProjectId = stored;
  }

  renderProjectSelect();
  await loadSessions(state.activeProjectId);
}

function selectSession(sessionId) {
  state.activeSessionId = sessionId;
  localStorage.setItem('activeProjectId', state.activeProjectId);
  localStorage.setItem(`activeSessionId:${state.activeProjectId}`, sessionId);
  renderSessionList();
  setStatus('session selected');
}

async function onProjectChange() {
  state.activeProjectId = els.projectSelect.value;
  localStorage.setItem('activeProjectId', state.activeProjectId);
  await loadSessions(state.activeProjectId);
}

async function createSession(event) {
  event.preventDefault();

  if (state.busy) {
    return;
  }

  if (!state.activeProjectId) {
    setStatus('select project first', true);
    return;
  }

  const title = els.sessionTitle ? els.sessionTitle.value.trim() : '';

  state.busy = true;
  setStatus('creating session...');

  try {
    const data = await api.createSession(state.activeProjectId, { title });
    state.activeSessionId = data.session.id;
    localStorage.setItem('activeProjectId', state.activeProjectId);
    localStorage.setItem(`activeSessionId:${state.activeProjectId}`, state.activeSessionId);
    if (els.sessionTitle) {
      els.sessionTitle.value = '';
    }
    await loadSessions(state.activeProjectId);
    setStatus('session created');
  } catch (error) {
    setStatus(error.message || 'failed to create session', true);
  } finally {
    state.busy = false;
  }
}

async function restartServer() {
  if (state.busy) {
    return;
  }

  state.busy = true;
  setStatus('restarting server...');

  try {
    await api.restartServer();
    setStatus('server restarting...');
  } catch (error) {
    const message = error && typeof error.message === 'string' ? error.message.toLowerCase() : '';
    if (message.includes('failed to fetch') || message.includes('load failed')) {
      setStatus('server restarting...');
    } else {
      setStatus(error.message || 'failed to restart server', true);
    }
  } finally {
    state.busy = false;
  }
}

async function selectTheme(themeId) {
  if (state.busy || themeId === state.currentTheme) {
    return;
  }

  state.busy = true;
  setStatus('saving theme...');

  try {
    const settings = await api.updateSettings({ theme: themeId });
    state.currentTheme = settings.theme;
    applyTheme(state.currentTheme);
    renderThemes();
    setStatus('theme saved');
  } catch (error) {
    setStatus(error.message || 'failed to save theme', true);
  } finally {
    state.busy = false;
  }
}

async function saveMasterProjectRoot(event) {
  event.preventDefault();

  if (state.busy) {
    return;
  }

  const nextRoot = els.masterRootInput.value.trim();
  if (!nextRoot) {
    setStatus('master root is required', true);
    return;
  }

  state.busy = true;
  setStatus('saving master root...');

  try {
    const settings = await api.updateSettings({ masterProjectRoot: nextRoot });
    state.masterProjectRoot = settings.masterProjectRoot;
    els.masterRootInput.value = state.masterProjectRoot;
    await loadProjects();
    setStatus('master root saved');
  } catch (error) {
    setStatus(error.message || 'failed to save master root', true);
  } finally {
    state.busy = false;
  }
}

async function init() {
  try {
    setStatus('loading settings...');
    const meta = await api.getMeta();

    state.themes = meta.themes || [];
    state.providers = meta.providers || [];
    state.currentTheme = meta.settings && meta.settings.theme ? meta.settings.theme : 'aether';
    state.masterProjectRoot =
      meta.settings && typeof meta.settings.masterProjectRoot === 'string'
        ? meta.settings.masterProjectRoot
        : '';

    applyTheme(state.currentTheme);
    renderThemes();
    els.masterRootInput.value = state.masterProjectRoot;

    els.providerList.textContent = state.providers.length > 0 ? state.providers.join(', ') : '-';
    await loadProjects();
    setStatus('ready');
  } catch (error) {
    setStatus(error.message || 'failed to load settings', true);
  }
}

els.masterRootForm.addEventListener('submit', saveMasterProjectRoot);
if (els.projectSelect) {
  els.projectSelect.addEventListener('change', onProjectChange);
}
if (els.sessionForm) {
  els.sessionForm.addEventListener('submit', createSession);
}
if (els.restartServerButton) {
  els.restartServerButton.addEventListener('click', restartServer);
}
init();
