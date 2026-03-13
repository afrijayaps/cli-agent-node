import { api } from './api.js';
import { applyTheme, THEME_PREVIEWS } from './theme.js';

const els = {
  masterRootForm: document.getElementById('masterRootForm'),
  masterRootInput: document.getElementById('masterRootInput'),
  themeGrid: document.getElementById('themeGrid'),
  status: document.getElementById('settingsStatus'),
  providerList: document.getElementById('providerList'),
  aiPrimarySelect: document.getElementById('aiPrimarySelect'),
  aiFallbackSelect: document.getElementById('aiFallbackSelect'),
  aiSaveButton: document.getElementById('aiSaveButton'),
  systemPromptInput: document.getElementById('systemPromptInput'),
  systemPromptSaveButton: document.getElementById('systemPromptSaveButton'),
  stopAllJobsButton: document.getElementById('stopAllJobsButton'),
  restartServerButton: document.getElementById('restartServerButton'),
};

const state = {
  themes: [],
  providers: [],
  currentTheme: 'aether',
  masterProjectRoot: '',
  aiPrimary: '',
  aiFallback: '',
  systemPrompt: '',
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

function renderAiManager() {
  if (!els.aiPrimarySelect || !els.aiFallbackSelect) {
    return;
  }

  els.aiPrimarySelect.innerHTML = '';
  els.aiFallbackSelect.innerHTML = '';

  if (state.providers.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No provider';
    els.aiPrimarySelect.appendChild(option);
    els.aiFallbackSelect.appendChild(option.cloneNode(true));
    els.aiPrimarySelect.disabled = true;
    els.aiFallbackSelect.disabled = true;
    return;
  }

  if (!state.providers.includes(state.aiPrimary)) {
    state.aiPrimary = state.providers[0];
  }

  if (!state.providers.includes(state.aiFallback)) {
    state.aiFallback = '';
  }

  if (state.aiFallback === state.aiPrimary) {
    state.aiFallback = '';
  }

  for (const provider of state.providers) {
    const option = document.createElement('option');
    option.value = provider;
    option.textContent = provider;
    els.aiPrimarySelect.appendChild(option);
  }

  const noneOption = document.createElement('option');
  noneOption.value = '';
  noneOption.textContent = 'None';
  els.aiFallbackSelect.appendChild(noneOption);

  for (const provider of state.providers) {
    if (provider === state.aiPrimary) {
      continue;
    }
    const option = document.createElement('option');
    option.value = provider;
    option.textContent = provider;
    els.aiFallbackSelect.appendChild(option);
  }

  els.aiPrimarySelect.disabled = false;
  els.aiFallbackSelect.disabled = false;
  els.aiPrimarySelect.value = state.aiPrimary;
  els.aiFallbackSelect.value = state.aiFallback || '';
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

async function stopAllJobs() {
  if (state.busy) {
    return;
  }

  const confirmed = window.confirm(
    'Stop semua job yang sedang berjalan? Request provider aktif akan dibatalkan.',
  );
  if (!confirmed) {
    return;
  }

  state.busy = true;
  setStatus('menghentikan semua job...');

  try {
    const result = await api.stopAllJobs();
    const stopped = typeof result.stopped === 'number' ? result.stopped : 0;
    const total = typeof result.total === 'number' ? result.total : stopped;

    if (total === 0) {
      setStatus('tidak ada job aktif');
    } else {
      setStatus(`berhasil stop ${stopped} dari ${total} job`);
    }
  } catch (error) {
    setStatus(error.message || 'gagal menghentikan job', true);
  } finally {
    state.busy = false;
  }
}

async function saveAiManager() {
  if (state.busy) {
    return;
  }

  if (!state.aiPrimary) {
    setStatus('primary AI wajib dipilih', true);
    return;
  }

  const payload = {
    aiPrimary: state.aiPrimary,
    aiFallback: state.aiFallback || '',
  };

  state.busy = true;
  setStatus('saving AI manager...');

  try {
    const settings = await api.updateSettings(payload);
    state.aiPrimary = settings.aiPrimary;
    state.aiFallback = settings.aiFallback;
    renderAiManager();
    setStatus('AI manager saved');
  } catch (error) {
    setStatus(error.message || 'failed to save AI manager', true);
  } finally {
    state.busy = false;
  }
}

async function saveSystemPrompt() {
  if (state.busy || !els.systemPromptInput) {
    return;
  }

  const nextPrompt = els.systemPromptInput.value || '';
  const payload = { systemPrompt: nextPrompt };

  state.busy = true;
  setStatus('saving system prompt...');

  try {
    const settings = await api.updateSettings(payload);
    state.systemPrompt = settings.systemPrompt || '';
    els.systemPromptInput.value = state.systemPrompt;
    setStatus('system prompt saved');
  } catch (error) {
    setStatus(error.message || 'failed to save system prompt', true);
  } finally {
    state.busy = false;
  }
}

function handlePrimaryChange() {
  state.aiPrimary = els.aiPrimarySelect.value;
  if (state.aiFallback === state.aiPrimary) {
    state.aiFallback = '';
  }
  renderAiManager();
}

function handleFallbackChange() {
  state.aiFallback = els.aiFallbackSelect.value;
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
    state.aiPrimary =
      meta.settings && typeof meta.settings.aiPrimary === 'string' ? meta.settings.aiPrimary : '';
    state.aiFallback =
      meta.settings && typeof meta.settings.aiFallback === 'string' ? meta.settings.aiFallback : '';
    state.masterProjectRoot =
      meta.settings && typeof meta.settings.masterProjectRoot === 'string'
        ? meta.settings.masterProjectRoot
        : '';
    state.systemPrompt =
      meta.settings && typeof meta.settings.systemPrompt === 'string' ? meta.settings.systemPrompt : '';

    applyTheme(state.currentTheme);
    renderThemes();
    renderAiManager();
    els.masterRootInput.value = state.masterProjectRoot;
    if (els.systemPromptInput) {
      els.systemPromptInput.value = state.systemPrompt;
    }

    els.providerList.textContent = state.providers.length > 0 ? state.providers.join(', ') : '-';
    setStatus('ready');
  } catch (error) {
    setStatus(error.message || 'failed to load settings', true);
  }
}

els.masterRootForm.addEventListener('submit', saveMasterProjectRoot);
if (els.aiPrimarySelect) {
  els.aiPrimarySelect.addEventListener('change', handlePrimaryChange);
}
if (els.aiFallbackSelect) {
  els.aiFallbackSelect.addEventListener('change', handleFallbackChange);
}
if (els.aiSaveButton) {
  els.aiSaveButton.addEventListener('click', saveAiManager);
}
if (els.systemPromptSaveButton) {
  els.systemPromptSaveButton.addEventListener('click', saveSystemPrompt);
}
if (els.stopAllJobsButton) {
  els.stopAllJobsButton.addEventListener('click', stopAllJobs);
}
if (els.restartServerButton) {
  els.restartServerButton.addEventListener('click', restartServer);
}
init();
