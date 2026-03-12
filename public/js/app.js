import { api } from './api.js';
import { applyTheme, formatRelative } from './theme.js';

const els = {
  sidePanel: document.getElementById('sidePanel'),
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
  process: {
    active: false,
    label: '',
    startedAt: 0,
    elapsedMs: 0,
    isError: false,
  },
  processIntervalId: null,
  requestAbortController: null,
  assistantFlashMessageId: '',
  assistantFlashTimeoutId: null,
  chatWarning: null,
  busy: false,
};

const PROCESS_LABELS = {
  creating: 'Creating session',
  sending: 'Sending prompt',
  waiting: 'Waiting provider response',
  persisting: 'Persisting response',
  done: 'Response received',
  stopped: 'Process stopped by user',
};

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

function updateSendButtonState() {
  if (state.awaitingAssistant) {
    els.sendButton.disabled = false;
    els.sendButton.textContent = 'Stop';
    els.sendButton.classList.add('stop');
    return;
  }

  els.sendButton.disabled = state.busy;
  els.sendButton.textContent = 'Send';
  els.sendButton.classList.remove('stop');
}

function setBusy(value) {
  state.busy = value;
  updateSendButtonState();
}

function scrollChatToBottom() {
  els.chatLog.scrollTop = els.chatLog.scrollHeight;
  requestAnimationFrame(() => {
    els.chatLog.scrollTop = els.chatLog.scrollHeight;
  });
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
    level: 'error',
    title: 'Gagal mendapatkan balasan dari provider.',
    createdAt: new Date().toISOString(),
  };
}

function createAbortError() {
  try {
    return new DOMException('The operation was aborted.', 'AbortError');
  } catch (_error) {
    const fallback = new Error('The operation was aborted.');
    fallback.name = 'AbortError';
    return fallback;
  }
}

function isAbortError(error) {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const name = typeof error.name === 'string' ? error.name.toLowerCase() : '';
  if (name === 'aborterror') {
    return true;
  }

  const message = typeof error.message === 'string' ? error.message.toLowerCase() : '';
  return message.includes('aborted') || message.includes('abort');
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getThinkingSnapshot() {
  return {
    label: state.process.label || PROCESS_LABELS.waiting,
    elapsedMs: Math.max(0, state.process.elapsedMs || 0),
    isError: !!state.process.isError,
  };
}

function renderThinkingPanel(snapshot) {
  const elapsedSec = (snapshot.elapsedMs / 1000).toFixed(1);
  const modeClass = snapshot.isError ? 'error' : 'active';

  return `
    <div class="thinking-inline ${modeClass}" role="status" aria-live="polite">
      <span class="thinking-inline-dot" aria-hidden="true"></span>
      <span class="thinking-inline-label">System Neural:</span>
      <span class="thinking-inline-phase" data-thinking="phase">${escapeHtml(snapshot.label)}</span>
      <span class="thinking-inline-percent" data-thinking="elapsed">${elapsedSec}s</span>
    </div>
  `;
}

function updateThinkingLivePanel() {
  const thinkingBox = els.chatLog.querySelector('.thinking-live');
  if (!thinkingBox) {
    return false;
  }

  const snapshot = getThinkingSnapshot();
  const elapsedEl = thinkingBox.querySelector('[data-thinking="elapsed"]');
  const phaseEl = thinkingBox.querySelector('[data-thinking="phase"]');
  thinkingBox.classList.toggle('error', snapshot.isError);
  thinkingBox.classList.toggle('active', !snapshot.isError);

  if (elapsedEl) {
    elapsedEl.textContent = `${(snapshot.elapsedMs / 1000).toFixed(1)}s`;
  }
  if (phaseEl) {
    phaseEl.textContent = snapshot.label;
  }

  return true;
}

function startThinkingAnimation(label = PROCESS_LABELS.waiting, isError = false) {
  if (state.processIntervalId) {
    clearInterval(state.processIntervalId);
    state.processIntervalId = null;
  }

  state.process.active = true;
  state.process.label = label;
  state.process.isError = isError;
  state.process.startedAt = Date.now();
  state.process.elapsedMs = 0;
  renderMessages();

  state.processIntervalId = setInterval(() => {
    if (!state.process.active) {
      return;
    }

    state.process.elapsedMs = Date.now() - state.process.startedAt;
    updateThinkingLivePanel();
  }, 200);
}

function setProcessLabel(label) {
  state.process.label = label;
  if (state.process.active) {
    state.process.elapsedMs = Date.now() - state.process.startedAt;
  }
  if (!updateThinkingLivePanel()) {
    renderMessages();
  }
}

function stopThinkingAnimation({ keepVisible = false, isError = false, finalLabel = '' } = {}) {
  if (state.processIntervalId) {
    clearInterval(state.processIntervalId);
    state.processIntervalId = null;
  }

  if (keepVisible) {
    state.process.active = true;
    state.process.isError = isError;
    if (finalLabel) {
      state.process.label = finalLabel;
    }
    if (state.process.startedAt > 0) {
      state.process.elapsedMs = Date.now() - state.process.startedAt;
    }
    renderMessages();
    return;
  }

  state.process.active = false;
  state.process.isError = false;
  state.process.label = '';
  state.process.startedAt = 0;
  state.process.elapsedMs = 0;
}

function stopActiveRequest() {
  if (!state.awaitingAssistant || !state.requestAbortController) {
    return;
  }

  setProcessLabel(PROCESS_LABELS.stopped);
  setStatus('stopping active request...', false, true);
  state.requestAbortController.abort();
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

function extractMessageParts(text) {
  if (typeof text !== 'string' || text.length === 0) {
    return [];
  }

  const parts = [];
  const pattern = /```([^\n`]*)\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    const before = text.slice(lastIndex, match.index).replace(/^\n+|\n+$/g, '');
    if (before.trim().length > 0) {
      parts.push({ type: 'text', value: before });
    }

    const language = (match[1] || 'text').trim() || 'text';
    const code = (match[2] || '').replace(/\n$/, '');
    if (code.trim().length > 0) {
      parts.push({ type: 'code', language, code });
    }
    lastIndex = pattern.lastIndex;
  }

  const tail = text.slice(lastIndex).replace(/^\n+|\n+$/g, '');
  if (tail.trim().length > 0) {
    parts.push({ type: 'text', value: tail });
  }

  if (parts.length === 0 && text.trim().length > 0) {
    parts.push({ type: 'text', value: text.trim() });
  }

  return parts;
}

function buildAssistantMessage(message, isLatestAssistant, shouldFlash, animationDelay) {
  const parts = extractMessageParts(message.content);
  if (parts.length === 0) {
    return null;
  }

  const box = document.createElement('article');
  box.className = `message assistant-flat enter${isLatestAssistant ? ' assistant-live' : ''}${
    shouldFlash ? ' assistant-arrived' : ''
  }`;
  box.style.animationDelay = animationDelay;

  const meta = document.createElement('div');
  meta.className = 'message-meta';
  meta.textContent = `Assistant (${message.provider || 'cli'}) • ${formatRelative(message.createdAt)}`;
  box.appendChild(meta);

  parts.forEach((part) => {
    if (part.type === 'text') {
      const textNode = document.createElement('div');
      textNode.className = 'assistant-flat-text';
      textNode.textContent = part.value;
      box.appendChild(textNode);
      return;
    }

    const card = document.createElement('div');
    card.className = 'code-card compact';

    const head = document.createElement('div');
    head.className = 'code-card-head';

    const label = document.createElement('span');
    label.className = 'code-card-label';
    label.textContent = part.language;

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'code-copy';
    copyBtn.textContent = 'Copy';
    copyBtn.addEventListener('click', async () => {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(part.code);
          setStatus('code copied');
        } else {
          throw new Error('clipboard unavailable');
        }
      } catch (_error) {
        setStatus('failed to copy code', true);
      }
    });

    head.append(label, copyBtn);

    const pre = document.createElement('pre');
    pre.textContent = part.code;

    card.append(head, pre);
    box.appendChild(card);
  });

  return box;
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
    ? `${session.title} • ${session.id} • ${session.messages.length} messages`
    : 'Create session to start chatting.';

  els.projectPathLabel.textContent = project ? project.projectPath : '-';
  updatePromptPlaceholder();
}

function updatePromptPlaceholder() {
  if (!els.promptInput) {
    return;
  }

  if (state.activeSessionId) {
    els.promptInput.placeholder = `Session: ${state.activeSessionId} | Tulis prompt...`;
    return;
  }

  els.promptInput.placeholder = 'Tulis prompt...';
}

function renderMessages() {
  const session = state.activeSession;
  const hasMessages = session && Array.isArray(session.messages) && session.messages.length > 0;
  const hasWarning = !!state.chatWarning;
  const hasProcess = state.process.active || state.process.isError;

  els.chatLog.innerHTML = '';

  if (!hasMessages && !hasWarning && !hasProcess) {
    els.chatLog.appendChild(els.emptyState);
    return;
  }

  if (hasMessages) {
    session.messages.forEach((message, index) => {
      const isLatestAssistant =
        message.role === 'assistant' && index === session.messages.length - 1 && !state.awaitingAssistant;
      const shouldFlash = message.role === 'assistant' && message.id && message.id === state.assistantFlashMessageId;
      const animationDelay = `${Math.min(index * 32, 160)}ms`;

      if (message.role === 'assistant') {
        const assistantMessage = buildAssistantMessage(message, isLatestAssistant, shouldFlash, animationDelay);
        if (assistantMessage) {
          els.chatLog.appendChild(assistantMessage);
        }
        return;
      }

      const box = document.createElement('article');
      box.className = `message enter user${shouldFlash ? ' assistant-arrived' : ''}`;
      box.style.animationDelay = animationDelay;

      const meta = document.createElement('div');
      meta.className = 'message-meta';
      meta.textContent = `You • ${formatRelative(message.createdAt)}`;

      const content = document.createElement('div');
      content.className = 'message-content';
      content.textContent = message.content;

      box.append(meta, content);
      els.chatLog.appendChild(box);
    });
  }

  if (hasProcess) {
    const box = document.createElement('article');
    box.className = `message assistant typing enter thinking-live${state.process.isError ? ' error' : ' active'}`;

    const meta = document.createElement('div');
    meta.className = 'message-meta';
    meta.textContent = `Process (${els.providerSelect.value || state.defaultProvider})`;

    const content = document.createElement('div');
    content.className = 'message-content';
    content.innerHTML = renderThinkingPanel(getThinkingSnapshot());

    box.append(meta, content);
    els.chatLog.appendChild(box);
  }

  if (state.chatWarning) {
    const warning = state.chatWarning;
    const warningBox = document.createElement('article');
    const level = warning.level === 'info' ? 'info' : 'error';
    warningBox.className = `message warning ${level} enter`;

    const meta = document.createElement('div');
    meta.className = 'message-meta warning-meta';
    meta.textContent = `Peringatan (${warning.provider}) • ${formatRelative(warning.createdAt)}`;

    const title = document.createElement('div');
    title.className = 'warning-title';
    title.textContent = warning.title || 'Terjadi masalah pada proses.';

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

  scrollChatToBottom();
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

  setBusy(true);
  setStatus('creating session...', false, true);

  try {
    const data = await api.createSession(state.activeProjectId, { title });
    state.activeSessionId = data.session.id;
    localStorage.setItem(`activeSessionId:${state.activeProjectId}`, state.activeSessionId);
    els.sessionTitle.value = '';

    await loadSessions(state.activeProjectId);
    const project = getSelectedProject();
    const projectPath = project && project.projectPath ? project.projectPath : '-';
    setStatus(`session created: ${state.activeSessionId} | path: ${projectPath}`);
  } catch (error) {
    setStatus(error.message || 'failed to create session', true);
  } finally {
    setBusy(false);
  }
}

async function ensureSessionForPrompt(prompt) {
  if (state.activeSessionId) {
    return state.activeSessionId;
  }

  throw new Error('create session in Settings first');
}

async function sendPrompt(event) {
  event.preventDefault();

  if (state.awaitingAssistant) {
    stopActiveRequest();
    return;
  }

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

  if (!state.activeSessionId) {
    setStatus('buat session dulu di panel kiri', true);
    return;
  }

  if (state.busy) {
    return;
  }

  state.chatWarning = null;
  setBusy(true);
  state.awaitingAssistant = true;
  updateSendButtonState();
  setStatus('neural pipeline active...', false, true);
  startThinkingAnimation(PROCESS_LABELS.creating);

  try {
    const controller = new AbortController();
    state.requestAbortController = controller;

    const sessionId = await ensureSessionForPrompt(prompt);
    if (controller.signal.aborted) {
      throw createAbortError();
    }
    setProcessLabel(PROCESS_LABELS.sending);
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
    renderHeader();
    renderMessages();
    setProcessLabel(PROCESS_LABELS.waiting);

    const data = await api.askInSession(
      state.activeProjectId,
      sessionId,
      { prompt, provider },
      { signal: controller.signal },
    );
    state.requestAbortController = null;
    setProcessLabel(PROCESS_LABELS.persisting);
    state.activeSession = data.session;
    els.promptInput.value = '';

    await loadSessions(state.activeProjectId);
    stopThinkingAnimation();
    state.chatWarning = null;
    if (typeof data.result !== 'string' || data.result.trim().length === 0) {
      state.chatWarning = {
        provider,
        code: null,
        details: 'Provider tidak mengembalikan teks balasan.',
        hint: 'Ulangi prompt atau cek login/status CLI provider di server.',
        level: 'error',
        title: 'Provider selesai, tapi tanpa konten balasan.',
        createdAt: new Date().toISOString(),
      };
    }
    const latestAssistant = Array.isArray(state.activeSession && state.activeSession.messages)
      ? [...state.activeSession.messages].reverse().find((item) => item.role === 'assistant')
      : null;
    scheduleAssistantFlash(latestAssistant && latestAssistant.id ? latestAssistant.id : '');
    setStatus('response received');
  } catch (error) {
    state.requestAbortController = null;
    const aborted = isAbortError(error);

    if (state.activeProjectId && state.activeSessionId) {
      try {
        await onSessionSelect(state.activeSessionId);
      } catch (_innerError) {
        // Keep current local state when refresh fails.
      }
    }

    if (aborted) {
      stopThinkingAnimation();
      state.chatWarning = {
        provider,
        code: null,
        details: 'Permintaan dihentikan oleh pengguna.',
        hint: 'Kirim prompt lagi jika ingin melanjutkan.',
        level: 'info',
        title: 'Proses dihentikan.',
        createdAt: new Date().toISOString(),
      };
      setStatus('request stopped');
    } else {
      state.chatWarning = buildChatWarning(error, provider);
      stopThinkingAnimation({
        keepVisible: true,
        isError: true,
        finalLabel:
          state.chatWarning.code !== null
            ? `Provider error (code ${state.chatWarning.code})`
            : 'Provider error',
      });
      setStatus(error.message || 'request failed', true);
    }
  } finally {
    state.awaitingAssistant = false;
    setBusy(false);
    if (!state.process.isError) {
      stopThinkingAnimation();
    }
    renderHeader();
    renderMessages();
    updateSendButtonState();
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
}

async function refreshProjects() {
  if (state.busy) {
    return;
  }

  setBusy(true);
  setStatus('refreshing project folders...', false, true);

  try {
    await loadProjects();
    setStatus('project list refreshed');
  } catch (error) {
    setStatus(error.message || 'failed to refresh project list', true);
  } finally {
    setBusy(false);
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

  setBusy(true);
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
    setBusy(false);
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

  updateSendButtonState();

  if (els.sessionForm) {
    els.sessionForm.addEventListener('submit', createSession);
  }
  els.askForm.addEventListener('submit', sendPrompt);
  els.projectSelect.addEventListener('change', onProjectSelectChange);
  els.refreshProjectsButton.addEventListener('click', refreshProjects);
  els.saveRootButton.addEventListener('click', saveMasterRootFromInline);
  els.editRootButton.addEventListener('click', toggleMasterRootEdit);
  if (els.activeProjectName) {
    els.activeProjectName.addEventListener('click', openMobilePanel);
    els.activeProjectName.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openMobilePanel();
      }
    });
  }
  els.masterRootInputInline.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      saveMasterRootFromInline();
    }
  });
  els.closePanelButton.addEventListener('click', closeMobilePanel);
  els.panelBackdrop.addEventListener('click', closeMobilePanel);
  window.addEventListener('resize', handleWindowResize);
}

init();
