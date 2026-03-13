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
  loginStatusDot: document.getElementById('loginStatusDot'),
  loginStatusText: document.getElementById('loginStatusText'),
  loginStatusHint: document.getElementById('loginStatusHint'),
  loginStatusEmail: document.getElementById('loginStatusEmail'),
  refreshLoginStatusButton: document.getElementById('refreshLoginStatusButton'),
  startDeviceAuthButton: document.getElementById('startDeviceAuthButton'),
  logoutCodexButton: document.getElementById('logoutCodexButton'),
  claudeStatusDot: document.getElementById('claudeStatusDot'),
  claudeStatusText: document.getElementById('claudeStatusText'),
  claudeStatusHint: document.getElementById('claudeStatusHint'),
  claudeStatusEmail: document.getElementById('claudeStatusEmail'),
  refreshClaudeStatusButton: document.getElementById('refreshClaudeStatusButton'),
  startClaudeLoginButton: document.getElementById('startClaudeLoginButton'),
  logoutClaudeButton: document.getElementById('logoutClaudeButton'),
  claudeLoginResult: document.getElementById('claudeLoginResult'),
  claudeLoginLinkWrap: document.getElementById('claudeLoginLinkWrap'),
  claudeLoginLink: document.getElementById('claudeLoginLink'),
  deviceAuthResult: document.getElementById('deviceAuthResult'),
  deviceAuthLinkWrap: document.getElementById('deviceAuthLinkWrap'),
  deviceAuthLink: document.getElementById('deviceAuthLink'),
  deviceAuthCodeWrap: document.getElementById('deviceAuthCodeWrap'),
  deviceAuthCode: document.getElementById('deviceAuthCode'),
  copyDeviceAuthCodeButton: document.getElementById('copyDeviceAuthCodeButton'),
  systemPromptInput: document.getElementById('systemPromptInput'),
  systemPromptSaveButton: document.getElementById('systemPromptSaveButton'),
  stopAllJobsButton: document.getElementById('stopAllJobsButton'),
  restartServerButton: document.getElementById('restartServerButton'),
};

const AUTH_UI = {
  codex: {
    label: 'Codex',
    dot: els.loginStatusDot,
    text: els.loginStatusText,
    hint: els.loginStatusHint,
    email: els.loginStatusEmail,
    loginCommand: 'codex login --device-auth',
  },
  claude: {
    label: 'Claude',
    dot: els.claudeStatusDot,
    text: els.claudeStatusText,
    hint: els.claudeStatusHint,
    email: els.claudeStatusEmail,
    loginCommand: 'claude auth login',
  },
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

function getAuthUi(provider = 'codex') {
  return AUTH_UI[provider] || null;
}

function getProviderLoginCommand(provider = 'codex') {
  const authUi = getAuthUi(provider);
  return authUi ? authUi.loginCommand : 'codex login --device-auth';
}

function setLoginStatus(provider = 'codex', status, details = '') {
  const authUi = getAuthUi(provider);
  if (!authUi || !authUi.dot || !authUi.text || !authUi.hint || !authUi.email) {
    return;
  }

  authUi.dot.className = 'status-dot';
  authUi.text.textContent = `${authUi.label}: unknown`;
  authUi.hint.textContent = details || '';
  authUi.email.textContent = 'Email: -';

  if (status === 'logged_in') {
    authUi.dot.classList.add('ok');
    authUi.text.textContent = `${authUi.label}: Logged in`;
    return;
  }

  if (status === 'logged_out') {
    authUi.dot.classList.add('warn');
    authUi.text.textContent = `${authUi.label}: Belum login`;
    return;
  }

  if (status === 'cli_missing') {
    authUi.dot.classList.add('error');
    authUi.text.textContent = `${authUi.label}: CLI not found`;
    return;
  }

  if (status === 'error') {
    authUi.dot.classList.add('error');
    authUi.text.textContent = `${authUi.label}: Error`;
    return;
  }

  authUi.dot.classList.add('unknown');
}

function resolveEmail(result = {}) {
  if (result && typeof result.email === 'string' && result.email.trim().length > 0) {
    return result.email.trim();
  }
  if (result && typeof result.account === 'string') {
    const emailMatch = result.account.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    if (emailMatch) {
      return emailMatch[0];
    }
  }
  return '';
}

function renderDeviceAuthOutput(result = {}) {
  const details = result && typeof result.details === 'string' ? result.details.trim() : '';
  const link = result && typeof result.verificationUrl === 'string' ? result.verificationUrl.trim() : '';
  const code = result && typeof result.userCode === 'string' ? result.userCode.trim() : '';

  if (els.deviceAuthResult) {
    els.deviceAuthResult.style.display = details ? 'block' : 'none';
    els.deviceAuthResult.textContent = details;
  }

  if (els.deviceAuthLinkWrap && els.deviceAuthLink) {
    els.deviceAuthLinkWrap.style.display = link ? 'block' : 'none';
    els.deviceAuthLink.href = link || '#';
    els.deviceAuthLink.textContent = link;
  }

  if (els.deviceAuthCodeWrap && els.deviceAuthCode) {
    els.deviceAuthCodeWrap.style.display = code ? 'block' : 'none';
    els.deviceAuthCode.textContent = code;
  }
}

function renderClaudeLoginOutput(result = {}) {
  const details = result && typeof result.details === 'string' ? result.details.trim() : '';
  const link =
    result &&
    typeof result.loginUrl === 'string' &&
    result.loginUrl.trim().length > 0
      ? result.loginUrl.trim()
      : '';

  if (els.claudeLoginResult) {
    els.claudeLoginResult.style.display = details ? 'block' : 'none';
    els.claudeLoginResult.textContent = details;
  }

  if (els.claudeLoginLinkWrap && els.claudeLoginLink) {
    els.claudeLoginLinkWrap.style.display = link ? 'block' : 'none';
    els.claudeLoginLink.href = link || '#';
    els.claudeLoginLink.textContent = link;
  }
}

function isGenericLoggedOutDetails(details = '') {
  return /^(not authenticated|auth file missing|auth file empty|not authenticated \(auth\.json\))$/i.test(
    String(details || '').trim(),
  );
}

function buildLoginHint(provider = 'codex', result = {}) {
  const status = result && result.status ? result.status : 'unknown';
  const details = result && typeof result.details === 'string' ? result.details.trim() : '';
  const metaParts = [];

  if (result && typeof result.account === 'string' && result.account.trim().length > 0) {
    metaParts.push(`Account: ${result.account.trim()}`);
  }
  if (result && typeof result.model === 'string' && result.model.trim().length > 0) {
    metaParts.push(`Model: ${result.model.trim()}`);
  }
  if (result && typeof result.session === 'string' && result.session.trim().length > 0) {
    metaParts.push(`Session: ${result.session.trim()}`);
  }
  if (result && typeof result.limit5h === 'string' && result.limit5h.trim().length > 0) {
    metaParts.push(`5h: ${result.limit5h.trim()}`);
  }
  if (
    result &&
    typeof result.limitWeekly === 'string' &&
    result.limitWeekly.trim().length > 0
  ) {
    metaParts.push(`Weekly: ${result.limitWeekly.trim()}`);
  }
  if (result && typeof result.authMethod === 'string' && result.authMethod.trim().length > 0) {
    metaParts.push(`Auth: ${result.authMethod.trim()}`);
  }
  if (result && typeof result.apiProvider === 'string' && result.apiProvider.trim().length > 0) {
    metaParts.push(`API: ${result.apiProvider.trim()}`);
  }
  if (result && typeof result.orgName === 'string' && result.orgName.trim().length > 0) {
    metaParts.push(`Org: ${result.orgName.trim()}`);
  } else if (result && typeof result.orgId === 'string' && result.orgId.trim().length > 0) {
    metaParts.push(`Org ID: ${result.orgId.trim()}`);
  }
  if (
    result &&
    typeof result.subscriptionType === 'string' &&
    result.subscriptionType.trim().length > 0
  ) {
    metaParts.push(`Subscription: ${result.subscriptionType.trim()}`);
  }
  if (result && typeof result.source === 'string' && result.source.trim().length > 0) {
    metaParts.push(`Source: ${result.source.trim()}`);
  }

  if (status === 'logged_out') {
    const hintParts = [];
    if (details && !isGenericLoggedOutDetails(details)) {
      hintParts.push(details);
    }
    hintParts.push(`Login ulang via CLI di server: ${getProviderLoginCommand(provider)}`);
    if (result && typeof result.source === 'string' && result.source.trim().length > 0) {
      hintParts.push(`Source: ${result.source.trim()}`);
    }
    return hintParts.join(' • ');
  }

  if (metaParts.length > 0) {
    return metaParts.join(' • ');
  }

  return details;
}

async function loadLoginStatus(provider = 'codex') {
  const authUi = getAuthUi(provider);
  if (!authUi || !authUi.dot || !authUi.text || !authUi.hint) {
    return;
  }

  setLoginStatus(provider, 'unknown', 'checking status...');
  try {
    const result = await api.getAuthStatus(provider);
    const status = result && result.status ? result.status : 'unknown';
    const details = result && typeof result.details === 'string' ? result.details : '';
    const email = resolveEmail(result);
    let hint = buildLoginHint(provider, result);
    if (status === 'error' && /sudo failed/i.test(details)) {
      hint = `Login ulang via CLI: ${getProviderLoginCommand(provider)}`;
    }
    setLoginStatus(provider, status, hint);
    if (authUi.email) {
      authUi.email.textContent = `Email: ${email || '-'}`;
    }
  } catch (error) {
    const message = error && typeof error.message === 'string' ? error.message : 'status unknown';
    setLoginStatus(provider, 'unknown', message);
  }
}

async function refreshLoginStatus(provider = 'codex') {
  if (state.busy) {
    return;
  }
  const authUi = getAuthUi(provider);
  const label = authUi ? authUi.label.toLowerCase() : provider;
  setStatus(`refreshing ${label} status...`);
  await loadLoginStatus(provider);
  setStatus('login status updated');
}

async function logoutProvider(provider = 'codex') {
  if (state.busy) {
    return;
  }

  const authUi = getAuthUi(provider);
  const label = authUi ? authUi.label : provider;
  const confirmed = window.confirm(`Logout akun ${label} CLI sekarang?`);
  if (!confirmed) {
    return;
  }

  state.busy = true;
  setStatus(`logging out ${label.toLowerCase()}...`);

  try {
    const result = await api.logoutAuth(provider);
    const details =
      result && typeof result.details === 'string' && result.details.trim().length > 0
        ? result.details.trim()
        : 'logout selesai';
    setStatus(details);
    if (provider === 'codex') {
      renderDeviceAuthOutput({});
    }
    if (provider === 'claude') {
      renderClaudeLoginOutput({});
    }
    await loadLoginStatus(provider);
  } catch (error) {
    setStatus(error.message || 'failed to logout', true);
  } finally {
    state.busy = false;
  }
}

async function startDeviceAuth() {
  if (state.busy) {
    return;
  }

  state.busy = true;
  setStatus('memulai device auth... nanti muncul link verifikasi.');

  try {
    const result = await api.startDeviceAuth('codex');
    renderDeviceAuthOutput(result);
    if (result && result.status === 'pending') {
      setStatus('device auth siap. link dan kode verifikasi sudah muncul.');
    } else if (result && (result.status === 'error' || result.status === 'cli_missing')) {
      const details =
        result && typeof result.details === 'string' && result.details.trim().length > 0
          ? result.details.trim()
          : 'device auth gagal';
      setStatus(details, true);
    } else {
      setStatus('device auth command selesai');
    }
  } catch (error) {
    renderDeviceAuthOutput({
      details: error && error.message ? error.message : 'device auth failed',
    });
    setStatus(error.message || 'failed to start device auth', true);
  } finally {
    state.busy = false;
  }
}

async function startClaudeLogin() {
  if (state.busy) {
    return;
  }

  state.busy = true;
  setStatus('memulai login Claude...');

  try {
    const result = await api.startAuthLogin('claude');
    renderClaudeLoginOutput(result);

    if (result && result.status === 'logged_in') {
      setStatus('Claude login selesai. status sedang disegarkan...');
      await loadLoginStatus('claude');
      setStatus('login Claude selesai');
    } else if (result && result.status === 'pending') {
      if (result.loginUrl) {
        setStatus('login Claude dimulai. buka link login lalu refresh Claude setelah selesai.');
      } else {
        setStatus('login Claude dimulai. selesaikan flow di browser/server lalu refresh Claude.');
      }
    } else if (result && (result.status === 'error' || result.status === 'cli_missing')) {
      const details =
        result && typeof result.details === 'string' && result.details.trim().length > 0
          ? result.details.trim()
          : 'login Claude gagal';
      setStatus(details, true);
    } else {
      setStatus('perintah login Claude dijalankan');
    }
  } catch (error) {
    renderClaudeLoginOutput({
      details: error && error.message ? error.message : 'login Claude gagal',
    });
    setStatus(error.message || 'failed to start Claude login', true);
  } finally {
    state.busy = false;
  }
}

async function copyDeviceAuthCode() {
  if (!els.deviceAuthCode) {
    return;
  }

  const code = els.deviceAuthCode.textContent ? els.deviceAuthCode.textContent.trim() : '';
  if (!code) {
    setStatus('kode device auth belum tersedia', true);
    return;
  }

  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(code);
      setStatus('kode device auth disalin');
      return;
    }
  } catch (_error) {
    // Fallback di bawah.
  }

  const textarea = document.createElement('textarea');
  textarea.value = code;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();

  try {
    const copied = document.execCommand('copy');
    if (!copied) {
      throw new Error('copy failed');
    }
    setStatus('kode device auth disalin');
  } catch (_error) {
    setStatus('gagal copy kode', true);
  } finally {
    document.body.removeChild(textarea);
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
    await Promise.all([loadLoginStatus('codex'), loadLoginStatus('claude')]);
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
if (els.refreshLoginStatusButton) {
  els.refreshLoginStatusButton.addEventListener('click', () => refreshLoginStatus('codex'));
}
if (els.startDeviceAuthButton) {
  els.startDeviceAuthButton.addEventListener('click', startDeviceAuth);
}
if (els.logoutCodexButton) {
  els.logoutCodexButton.addEventListener('click', () => logoutProvider('codex'));
}
if (els.refreshClaudeStatusButton) {
  els.refreshClaudeStatusButton.addEventListener('click', () => refreshLoginStatus('claude'));
}
if (els.startClaudeLoginButton) {
  els.startClaudeLoginButton.addEventListener('click', startClaudeLogin);
}
if (els.logoutClaudeButton) {
  els.logoutClaudeButton.addEventListener('click', () => logoutProvider('claude'));
}
if (els.copyDeviceAuthCodeButton) {
  els.copyDeviceAuthCodeButton.addEventListener('click', copyDeviceAuthCode);
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
