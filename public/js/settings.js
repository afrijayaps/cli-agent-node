import { api } from './api.js';
import { applyTheme, THEME_PREVIEWS } from './theme.js';

const els = {
  masterRootForm: document.getElementById('masterRootForm'),
  masterRootInput: document.getElementById('masterRootInput'),
  themeGrid: document.getElementById('themeGrid'),
  status: document.getElementById('settingsStatus'),
  providerList: document.getElementById('providerList'),
};

const state = {
  themes: [],
  providers: [],
  currentTheme: 'aether',
  masterProjectRoot: '',
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
    state.masterProjectRoot =
      meta.settings && typeof meta.settings.masterProjectRoot === 'string'
        ? meta.settings.masterProjectRoot
        : '';

    applyTheme(state.currentTheme);
    renderThemes();
    els.masterRootInput.value = state.masterProjectRoot;

    els.providerList.textContent = state.providers.length > 0 ? state.providers.join(', ') : '-';
    setStatus('ready');
  } catch (error) {
    setStatus(error.message || 'failed to load settings', true);
  }
}

els.masterRootForm.addEventListener('submit', saveMasterProjectRoot);
init();
