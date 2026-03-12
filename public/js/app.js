import { api } from './api.js';
import { applyTheme, formatRelative } from './theme.js';

const els = {
  sidePanel: document.getElementById('sidePanel'),
  openPanelButton: document.getElementById('openPanelButton'),
  closePanelButton: document.getElementById('closePanelButton'),
  panelBackdrop: document.getElementById('panelBackdrop'),
  masterRootInputInline: document.getElementById('masterRootInputInline'),
  saveRootButton: document.getElementById('saveRootButton'),
  editRootButton: document.getElementById('editRootButton'),
  refreshProjectsButton: document.getElementById('refreshProjectsButton'),
  projectSelect: document.getElementById('projectSelect'),
  projectPathLabel: document.getElementById('projectPathLabel'),
  sessionForm: document.getElementById('sessionForm'),
  sessionTitle: document.getElementById('sessionTitle'),
  sessionList: document.getElementById('sessionList'),
  activeProjectName: document.getElementById('activeProjectName'),
  activeSessionName: document.getElementById('activeSessionName'),
  chatLog: document.getElementById('chatLog'),
  emptyState: document.getElementById('emptyState'),
  providerSelect: document.getElementById('providerSelect'),
  askForm: document.getElementById('askForm'),
  promptInput: document.getElementById('promptInput'),
  sendButton: document.getElementById('sendButton'),
  statusText: document.getElementById('statusText'),
};

const state = {
  providers: [],
  defaultProvider: 'codex',
  masterProjectRoot: '',
  masterRootLocked: true,
  projects: [],
  sessions: [],
  activeProjectId: '',
  activeSessionId: '',
  activeSession: null,
  awaitingAssistant: false,
  thinkingProgress: 0,
  thinkingPhaseIndex: 0,
  thinkingTick: 0,
  thinkingMetrics: {
    tokensPerSec: 0,
    latencyMs: 0,
    branchCount: 0,
    confidence: 0,
  },
  thinkingIntervalId: null,
  assistantFlashMessageId: '',
  assistantFlashTimeoutId: null,
  chatWarning: null,
  busy: false,
};

const THINKING_PHASES = [
  'Analyzing workspace context',
  'Mapping dependency graph',
  'Simulating response branches',
  'Optimizing answer structure',
  'Finalizing response protocol',
];

const THINKING_PIPELINE = ['Context ingest', 'Intent alignment', 'Solution drafting', 'Safety checks', 'Response shaping'];

const THINKING_NOTES = [
  'Scanning workspace vectors and prompt intent...',
  'Resolving best-response trajectory...',
  'Running style and relevance calibration...',
  'Balancing brevity, depth, and safety...',
  'Packaging final output for delivery...',
];

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function updateThinkingMetrics() {
  const progressBoost = Math.floor(state.thinkingProgress / 10);
  state.thinkingMetrics.tokensPerSec = randomInt(26, 52) + progressBoost;
  state.thinkingMetrics.latencyMs = randomInt(170, 520);
  state.thinkingMetrics.branchCount = randomInt(4, 13);
  state.thinkingMetrics.confidence = Math.min(99, randomInt(70, 84) + Math.floor(state.thinkingProgress / 4));
}

function scheduleAssistantFlash(messageId) {
  if (!messageId) {
    return;
  }

  if (state.assistantFlashTimeoutId) {
    clearTimeout(state.assistantFlashTimeoutId);
    state.assistantFlashTimeoutId = null;
  }

  state.assistantFlashMessageId = messageId;
  renderMessages();
  state.assistantFlashTimeoutId = setTimeout(() => {
    state.assistantFlashMessageId = '';
    state.assistantFlashTimeoutId = null;
    renderMessages();
  }, 1600);
}

function isMobileViewport() {
  return window.matchMedia('(max-width: 980px)').matches;
}

function openMobilePanel() {
  if (!isMobileViewport()) {
    return;
  }

  document.body.classList.add('panel-open');
}

function closeMobilePanel() {
  document.body.classList.remove('panel-open');
}

function setStatus(message, isError = false, isBusy = false) {
  els.statusText.textContent = `Status: ${message}`;
  els.statusText.classList.toggle('error', isError);
  els.statusText.classList.toggle('busy', !isError && isBusy);
}

function buildWarningHint(details) {
  const text = typeof details === 'string' ? details.toLowerCase() : '';

  if (text.includes('not found') || text.includes('path')) {
    return 'CLI codex tidak ditemukan di PATH server. Cek instalasi dan PATH.';
  }

  if (text.includes('login') || text.includes('auth') || text.includes('token') || text.includes('permission')) {
    return 'Sesi login Codex kemungkinan bermasalah. Jalankan `codex login` di server.';
  }

  if (text.includes('timeout') || text.includes('timed out')) {
    return 'Permintaan timeout. Coba prompt lebih singkat atau ulangi beberapa detik lagi.';
  }

  return 'Cek log service/server untuk detail tambahan.';
}

function buildChatWarning(error, providerFallback) {
  const body = error && typeof error === 'object' ? error.body : null;
  const detailsFromBody = body && typeof body.details === 'string' ? body.details : '';
  const detailsFromMessage = error && typeof error.message === 'string' ? error.message : '';
  const details = detailsFromBody || detailsFromMessage || 'Request failed.';
  const providerFromBody = body && typeof body.provider === 'string' ? body.provider : '';
  const code = body && typeof body.code === 'number' ? body.code : null;

  return {
    provider: providerFromBody || providerFallback || state.defaultProvider,
    code,
    details,
    hint: buildWarningHint(details),
    createdAt: new Date().toISOString(),
  };
}

function buildThinkingPipelineRows(progress) {
  return THINKING_PIPELINE.map((label, index) => {
    const point = ((index + 1) / THINKING_PIPELINE.length) * 100;
    const done = progress >= point + 10;
    const active = !done && progress >= point - 12;
    const stepClass = done ? 'done' : active ? 'active' : 'pending';
    const statusText = done ? 'synced' : active ? 'processing' : 'queued';

    return `
      <li class="pipeline-step ${stepClass}">
        <span class="pipeline-dot"></span>
        <span class="pipeline-label">${label}</span>
        <span class="pipeline-status">${statusText}</span>
      </li>
    `;
  }).join('');
}

function getThinkingSnapshot() {
  const phase = THINKING_PHASES[state.thinkingPhaseIndex] || THINKING_PHASES[0];
  const progress = Math.max(1, Math.min(state.thinkingProgress, 99));
  const note = THINKING_NOTES[(state.thinkingTick + state.thinkingPhaseIndex) % THINKING_NOTES.length];
  const telemetry = state.thinkingMetrics;
  const pipelineRows = buildThinkingPipelineRows(progress);

  return {
    phase,
    progress,
    note,
    telemetry,
    pipelineRows,
  };
}

function renderThinkingPanel(snapshot) {
  const { phase, progress, note, telemetry, pipelineRows } = snapshot;

  return `
    <div class="thinking-shell">
      <div class="thinking-grid"></div>
      <div class="thinking-orbit" aria-hidden="true"></div>
      <div class="thinking-title-row">
        <div class="thinking-title">
          <span class="signal-ring"></span>
          SYSTEM THINKING PROCESS
        </div>
        <div class="thinking-percent" data-thinking="percent">${progress}% COMPLETE</div>
      </div>
      <div class="thinking-phase" data-thinking="phase">${phase}</div>
      <div class="thinking-rail">
        <span data-thinking="rail" style="width:${progress}%"></span>
      </div>
      <div class="thinking-telemetry">
        <div class="metric-card">
          <span>TOKENS/S</span>
          <strong data-thinking="tokens">${telemetry.tokensPerSec}</strong>
        </div>
        <div class="metric-card">
          <span>LATENCY</span>
          <strong data-thinking="latency">${telemetry.latencyMs}ms</strong>
        </div>
        <div class="metric-card">
          <span>BRANCHES</span>
          <strong data-thinking="branches">${telemetry.branchCount}</strong>
        </div>
        <div class="metric-card">
          <span>CONF</span>
          <strong data-thinking="confidence">${telemetry.confidence}%</strong>
        </div>
      </div>
      <ul class="thinking-pipeline" data-thinking="pipeline">${pipelineRows}</ul>
      <div class="thinking-sub" data-thinking="note">${note}</div>
      <div class="thinking-bars">
        <span></span><span></span><span></span><span></span><span></span><span></span>
        <span></span><span></span><span></span><span></span><span></span><span></span>
      </div>
    </div>
  `;
}

function updateThinkingLivePanel() {
  const thinkingBox = els.chatLog.querySelector('.thinking-live');
  if (!thinkingBox) {
    return false;
  }

  const snapshot = getThinkingSnapshot();
  const percentEl = thinkingBox.querySelector('[data-thinking="percent"]');
  const phaseEl = thinkingBox.querySelector('[data-thinking="phase"]');
  const railEl = thinkingBox.querySelector('[data-thinking="rail"]');
  const tokensEl = thinkingBox.querySelector('[data-thinking="tokens"]');
  const latencyEl = thinkingBox.querySelector('[data-thinking="latency"]');
  const branchesEl = thinkingBox.querySelector('[data-thinking="branches"]');
  const confidenceEl = thinkingBox.querySelector('[data-thinking="confidence"]');
  const pipelineEl = thinkingBox.querySelector('[data-thinking="pipeline"]');
  const noteEl = thinkingBox.querySelector('[data-thinking="note"]');

  if (percentEl) {
    percentEl.textContent = `${snapshot.progress}% COMPLETE`;
  }
  if (phaseEl) {
    phaseEl.textContent = snapshot.phase;
  }
  if (railEl) {
    railEl.style.width = `${snapshot.progress}%`;
  }
  if (tokensEl) {
    tokensEl.textContent = String(snapshot.telemetry.tokensPerSec);
  }
  if (latencyEl) {
    latencyEl.textContent = `${snapshot.telemetry.latencyMs}ms`;
  }
  if (branchesEl) {
    branchesEl.textContent = String(snapshot.telemetry.branchCount);
  }
  if (confidenceEl) {
    confidenceEl.textContent = `${snapshot.telemetry.confidence}%`;
  }
  if (pipelineEl) {
    pipelineEl.innerHTML = snapshot.pipelineRows;
  }
  if (noteEl) {
    noteEl.textContent = snapshot.note;
  }

  return true;
}

function startThinkingAnimation() {
  if (state.thinkingIntervalId) {
    clearInterval(state.thinkingIntervalId);
    state.thinkingIntervalId = null;
  }

  state.thinkingProgress = 12 + Math.floor(Math.random() * 6);
  state.thinkingPhaseIndex = 0;
  state.thinkingTick = 0;
  updateThinkingMetrics();
  renderMessages();

  state.thinkingIntervalId = setInterval(() => {
    if (!state.awaitingAssistant) {
      return;
    }

    state.thinkingTick += 1;
    const step = 2 + Math.floor(Math.random() * 6);
    state.thinkingProgress = Math.min(state.thinkingProgress + step, 96);

    if (Math.random() > 0.45) {
      state.thinkingPhaseIndex = (state.thinkingPhaseIndex + 1) % THINKING_PHASES.length;
    }

    updateThinkingMetrics();
    const phase = THINKING_PHASES[state.thinkingPhaseIndex];
    setStatus(`${phase} • ${state.thinkingProgress}%`, false, true);
    if (!updateThinkingLivePanel()) {
      renderMessages();
    }
  }, 520);
}

function stopThinkingAnimation() {
  if (state.thinkingIntervalId) {
    clearInterval(state.thinkingIntervalId);
    state.thinkingIntervalId = null;
  }

  state.thinkingTick = 0;
}

function renderMasterProjectRoot() {
  els.masterRootInputInline.value = state.masterProjectRoot || '';
}

function setMasterRootLockState(locked) {
  state.masterRootLocked = locked;
  els.masterRootInputInline.disabled = locked;
  els.saveRootButton.disabled = locked || state.busy;
  els.editRootButton.textContent = locked ? 'Buka/Edit' : 'Batal Edit';
  els.editRootButton.disabled = state.busy;
}

function getSelectedProject() {
  return state.projects.find((project) => project.id === state.activeProjectId) || null;
}

function renderProjectSelect() {
  els.projectSelect.innerHTML = '';

  if (state.projects.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No project yet';
    els.projectSelect.appendChild(option);
    els.projectSelect.value = '';
    state.activeProjectId = '';
    return;
  }

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
  els.sessionList.innerHTML = '';

  state.sessions.forEach((session, index) => {
    const item = document.createElement('li');
    item.className = `session-item enter${session.id === state.activeSessionId ? ' active' : ''}`;
    item.style.animationDelay = `${Math.min(index * 24, 120)}ms`;
    item.dataset.sessionId = session.id;

    const title = document.createElement('div');
    title.className = 'session-title';
    title.textContent = session.title;

    const meta = document.createElement('div');
    meta.className = 'small';
    meta.textContent = `${session.messageCount || 0} msg • ${formatRelative(session.updatedAt)}`;

    item.append(title, meta);
    item.addEventListener('click', () => onSessionSelect(session.id));
    els.sessionList.appendChild(item);
  });
}

function renderHeader() {
  const project = getSelectedProject();
  const session = state.activeSession;

  els.activeProjectName.textContent = project ? project.name : 'No project selected';
  els.activeSessionName.textContent = session
    ? `${session.title} • ${session.messages.length} messages`
    : 'Create session to start chatting.';

  els.projectPathLabel.textContent = project ? project.projectPath : '-';
}

function renderMessages() {
  const session = state.activeSession;
  const hasMessages = session && Array.isArray(session.messages) && session.messages.length > 0;
  const hasWarning = !!state.chatWarning;

  els.chatLog.innerHTML = '';

  if (!hasMessages && !hasWarning) {
    els.chatLog.appendChild(els.emptyState);
    return;
  }

  session.messages.forEach((message, index) => {
    const isLatestAssistant =
      message.role === 'assistant' && index === session.messages.length - 1 && !state.awaitingAssistant;
    const shouldFlash = message.role === 'assistant' && message.id && message.id === state.assistantFlashMessageId;
    const box = document.createElement('article');
    box.className = `message enter ${message.role === 'user' ? 'user' : 'assistant'}${
      isLatestAssistant ? ' assistant-live' : ''
    }${shouldFlash ? ' assistant-arrived' : ''}`;
    box.style.animationDelay = `${Math.min(index * 32, 160)}ms`;

    const meta = document.createElement('div');
    meta.className = 'message-meta';
    const label = message.role === 'user' ? 'You' : `Assistant (${message.provider || 'cli'})`;
    meta.textContent = `${label} • ${formatRelative(message.createdAt)}`;

    const content = document.createElement('div');
    content.className = 'message-content';
    content.textContent = message.content;

    box.append(meta, content);
    els.chatLog.appendChild(box);
  });

  if (state.awaitingAssistant) {
    const box = document.createElement('article');
    box.className = 'message assistant typing enter thinking-live';

    const meta = document.createElement('div');
    meta.className = 'message-meta';
    meta.textContent = `Assistant (${els.providerSelect.value || state.defaultProvider}) • neural process online`;

    const content = document.createElement('div');
    content.className = 'message-content';
    content.innerHTML = renderThinkingPanel(getThinkingSnapshot());

    box.append(meta, content);
    els.chatLog.appendChild(box);
  }

  if (state.chatWarning) {
    const warning = state.chatWarning;
    const warningBox = document.createElement('article');
    warningBox.className = 'message warning enter';

    const meta = document.createElement('div');
    meta.className = 'message-meta warning-meta';
    meta.textContent = `Peringatan (${warning.provider}) • ${formatRelative(warning.createdAt)}`;

    const title = document.createElement('div');
    title.className = 'warning-title';
    title.textContent = 'Gagal mendapatkan balasan dari provider.';

    const content = document.createElement('div');
    content.className = 'message-content warning-content';
    const lines = [warning.details];
    if (warning.code !== null) {
      lines.push(`Code: ${warning.code}`);
    }
    if (warning.hint) {
      lines.push(`Saran: ${warning.hint}`);
    }
    content.textContent = lines.join('\n');

    warningBox.append(meta, title, content);
    els.chatLog.appendChild(warningBox);
  }

  els.chatLog.scrollTop = els.chatLog.scrollHeight;
}

async function loadMetaAndSettings() {
  const meta = await api.getMeta();
  state.providers = meta.providers || [];
  state.defaultProvider = typeof meta.defaultProvider === 'string' ? meta.defaultProvider : 'codex';
  state.masterProjectRoot =
    meta.settings && typeof meta.settings.masterProjectRoot === 'string'
      ? meta.settings.masterProjectRoot
      : '';
  renderMasterProjectRoot();
  setMasterRootLockState(true);

  els.providerSelect.innerHTML = '';
  const providerToUse = state.providers.includes(state.defaultProvider)
    ? state.defaultProvider
    : state.providers[0] || '';

  if (!providerToUse) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No provider';
    els.providerSelect.appendChild(option);
    els.providerSelect.disabled = true;
  } else {
    const option = document.createElement('option');
    option.value = providerToUse;
    option.textContent = `${providerToUse} (default)`;
    els.providerSelect.appendChild(option);
    els.providerSelect.value = providerToUse;
    els.providerSelect.disabled = true;
  }

  const theme = meta.settings && meta.settings.theme ? meta.settings.theme : 'aether';
  applyTheme(theme);
}

async function loadProjects() {
  const data = await api.getProjects();
  state.projects = data.projects || [];
  if (typeof data.masterProjectRoot === 'string') {
    state.masterProjectRoot = data.masterProjectRoot;
    renderMasterProjectRoot();
  }

  const stored = localStorage.getItem('activeProjectId');
  if (stored && state.projects.some((project) => project.id === stored)) {
    state.activeProjectId = stored;
  }

  renderProjectSelect();

  if (state.activeProjectId) {
    await loadSessions(state.activeProjectId);
  } else {
    state.sessions = [];
    state.activeSessionId = '';
    state.activeSession = null;
    renderSessionList();
    renderHeader();
    renderMessages();
  }
}

async function loadSessions(projectId) {
  const data = await api.getSessions(projectId);
  state.sessions = data.sessions || [];

  const stored = localStorage.getItem(`activeSessionId:${projectId}`);
  if (stored && state.sessions.some((session) => session.id === stored)) {
    state.activeSessionId = stored;
  } else if (!state.sessions.some((session) => session.id === state.activeSessionId)) {
    state.activeSessionId = state.sessions[0] ? state.sessions[0].id : '';
  }

  renderSessionList();

  if (state.activeSessionId) {
    await onSessionSelect(state.activeSessionId, false);
  } else {
    state.activeSession = null;
    renderHeader();
    renderMessages();
  }
}

async function onSessionSelect(sessionId, shouldRenderList = true) {
  state.activeSessionId = sessionId;
  localStorage.setItem(`activeSessionId:${state.activeProjectId}`, sessionId);
  state.assistantFlashMessageId = '';
  state.chatWarning = null;

  const data = await api.getSession(state.activeProjectId, sessionId);
  state.activeSession = data.session;

  if (shouldRenderList) {
    renderSessionList();
  }

  renderHeader();
  renderMessages();

  if (isMobileViewport()) {
    closeMobilePanel();
  }
}

async function createSession(event) {
  event.preventDefault();

  if (!state.activeProjectId) {
    setStatus('select project first', true);
    return;
  }

  const title = els.sessionTitle.value.trim();

  state.busy = true;
  setStatus('creating session...', false, true);

  try {
    const data = await api.createSession(state.activeProjectId, { title });
    state.activeSessionId = data.session.id;
    localStorage.setItem(`activeSessionId:${state.activeProjectId}`, state.activeSessionId);
    els.sessionTitle.value = '';

    await loadSessions(state.activeProjectId);
    setStatus('session created');
  } catch (error) {
    setStatus(error.message || 'failed to create session', true);
  } finally {
    state.busy = false;
  }
}

async function ensureSessionForPrompt(prompt) {
  if (state.activeSessionId) {
    return state.activeSessionId;
  }

  const title = prompt.split('\n')[0].slice(0, 48) || 'New Session';
  const data = await api.createSession(state.activeProjectId, { title });
  state.activeSessionId = data.session.id;
  localStorage.setItem(`activeSessionId:${state.activeProjectId}`, state.activeSessionId);
  await loadSessions(state.activeProjectId);
  return state.activeSessionId;
}

async function sendPrompt(event) {
  event.preventDefault();

  const prompt = els.promptInput.value.trim();
  const provider = els.providerSelect.value;

  if (!state.activeProjectId) {
    setStatus('create/select project first', true);
    return;
  }

  if (!prompt) {
    setStatus('prompt is required', true);
    return;
  }

  if (!provider) {
    setStatus('provider is required', true);
    return;
  }

  if (state.busy) {
    return;
  }

  state.chatWarning = null;
  state.busy = true;
  els.sendButton.disabled = true;
  setStatus('neural pipeline warming up...', false, true);

  try {
    const sessionId = await ensureSessionForPrompt(prompt);
    const optimisticMessage = {
      id: `temp-${Date.now().toString(36)}`,
      role: 'user',
      provider,
      content: prompt,
      createdAt: new Date().toISOString(),
    };

    if (!state.activeSession) {
      state.activeSession = {
        id: sessionId,
        title: 'Current Session',
        messages: [],
      };
    }

    if (!Array.isArray(state.activeSession.messages)) {
      state.activeSession.messages = [];
    }

    state.activeSession.messages.push(optimisticMessage);
    state.awaitingAssistant = true;
    startThinkingAnimation();
    renderHeader();

    const data = await api.askInSession(state.activeProjectId, sessionId, { prompt, provider });
    state.awaitingAssistant = false;
    stopThinkingAnimation();
    state.activeSession = data.session;
    els.promptInput.value = '';

    await loadSessions(state.activeProjectId);
    state.chatWarning = null;
    if (typeof data.result !== 'string' || data.result.trim().length === 0) {
      state.chatWarning = {
        provider,
        code: null,
        details: 'Provider tidak mengembalikan teks balasan.',
        hint: 'Ulangi prompt atau cek login/status CLI provider di server.',
        createdAt: new Date().toISOString(),
      };
    }
    const latestAssistant = Array.isArray(state.activeSession && state.activeSession.messages)
      ? [...state.activeSession.messages].reverse().find((item) => item.role === 'assistant')
      : null;
    scheduleAssistantFlash(latestAssistant && latestAssistant.id ? latestAssistant.id : '');
    setStatus('response received');
  } catch (error) {
    state.awaitingAssistant = false;
    stopThinkingAnimation();
    if (state.activeProjectId && state.activeSessionId) {
      try {
        await onSessionSelect(state.activeSessionId);
      } catch (_innerError) {
        // Keep current local state when refresh fails.
      }
    }
    state.chatWarning = buildChatWarning(error, provider);
    renderMessages();
    setStatus(error.message || 'request failed', true);
  } finally {
    state.busy = false;
    state.awaitingAssistant = false;
    stopThinkingAnimation();
    els.sendButton.disabled = false;
    renderHeader();
    renderMessages();
  }
}

async function onProjectSelectChange() {
  state.activeProjectId = els.projectSelect.value;
  localStorage.setItem('activeProjectId', state.activeProjectId);
  state.chatWarning = null;

  if (!state.activeProjectId) {
    state.sessions = [];
    state.activeSessionId = '';
    state.activeSession = null;
    renderSessionList();
    renderHeader();
    renderMessages();
    return;
  }

  await loadSessions(state.activeProjectId);
  renderHeader();

  if (isMobileViewport()) {
    closeMobilePanel();
  }
}

async function refreshProjects() {
  if (state.busy) {
    return;
  }

  state.busy = true;
  setStatus('refreshing project folders...', false, true);

  try {
    await loadProjects();
    setStatus('project list refreshed');
  } catch (error) {
    setStatus(error.message || 'failed to refresh project list', true);
  } finally {
    state.busy = false;
  }
}

async function saveMasterRootFromInline() {
  if (state.busy) {
    return;
  }

  const nextRoot = els.masterRootInputInline.value.trim();
  if (!nextRoot) {
    setStatus('master root wajib diisi', true);
    return;
  }

  if (!nextRoot.startsWith('/')) {
    setStatus('master root harus mulai dari path root (/)', true);
    return;
  }

  state.busy = true;
  els.saveRootButton.disabled = true;
  els.editRootButton.disabled = true;
  setStatus('menyimpan project source root...', false, true);

  try {
    const settings = await api.updateSettings({ masterProjectRoot: nextRoot });
    state.masterProjectRoot = settings.masterProjectRoot;
    renderMasterProjectRoot();
    setMasterRootLockState(true);
    await loadProjects();
    setStatus('project source root tersimpan');
  } catch (error) {
    setStatus(error.message || 'gagal simpan project source root', true);
  } finally {
    state.busy = false;
    els.editRootButton.disabled = false;
    els.saveRootButton.disabled = state.masterRootLocked;
  }
}

function toggleMasterRootEdit() {
  if (state.busy) {
    return;
  }

  if (state.masterRootLocked) {
    setMasterRootLockState(false);
    els.masterRootInputInline.focus();
    els.masterRootInputInline.select();
    setStatus('edit mode aktif untuk project source root');
    return;
  }

  renderMasterProjectRoot();
  setMasterRootLockState(true);
  setStatus('edit project source root dibatalkan');
}

function handleWindowResize() {
  if (!isMobileViewport()) {
    closeMobilePanel();
  }
}

async function init() {
  try {
    closeMobilePanel();
    setStatus('loading...', false, true);
    await loadMetaAndSettings();
    await loadProjects();
    renderHeader();
    renderMessages();
    setStatus('ready');
  } catch (error) {
    setStatus(error.message || 'failed to load app', true);
  }

  els.sessionForm.addEventListener('submit', createSession);
  els.askForm.addEventListener('submit', sendPrompt);
  els.projectSelect.addEventListener('change', onProjectSelectChange);
  els.refreshProjectsButton.addEventListener('click', refreshProjects);
  els.saveRootButton.addEventListener('click', saveMasterRootFromInline);
  els.editRootButton.addEventListener('click', toggleMasterRootEdit);
  els.masterRootInputInline.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      saveMasterRootFromInline();
    }
  });
  els.openPanelButton.addEventListener('click', openMobilePanel);
  els.closePanelButton.addEventListener('click', closeMobilePanel);
  els.panelBackdrop.addEventListener('click', closeMobilePanel);
  window.addEventListener('resize', handleWindowResize);
}

init();
