import { api } from './api.js';
import { applyTheme, formatRelative } from './theme.js';
import { createProcessUI } from './process-ui.js';
import { createMessageQueue } from './message-queue.js';

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
  modelSelect: document.getElementById('modelSelect'),
  modelInput: document.getElementById('modelInput'),
  modelInputWrap: document.getElementById('modelInputWrap'),
  reasoningSelect: document.getElementById('reasoningSelect'),
  modeSelect: document.getElementById('modeSelect'),
  askForm: document.getElementById('askForm'),
  promptInput: document.getElementById('promptInput'),
  sendButton: document.getElementById('sendButton'),
  stopButton: document.getElementById('stopButton'),
  statusText: document.getElementById('statusText'),
  queueInfo: document.getElementById('queueInfo'),
  jobIndicator: document.getElementById('jobIndicator'),
  jobCount: document.getElementById('jobCount'),
  jobsPopover: document.getElementById('jobsPopover'),
  jobsPopoverBody: document.getElementById('jobsPopoverBody'),
  jobsPopoverClose: document.getElementById('jobsPopoverClose'),
};

const state = {
  providers: [],
  defaultProvider: 'codex',
  activeProvider: '',
  models: [],
  modelSource: 'none',
  preferences: {
    model: '',
    reasoning: 'medium',
    mode: 'normal',
  },
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
    visible: false,
    exiting: false,
    events: [],
    showAll: false,
    compact: false,
    hasEdits: false,
  },
  requestAbortController: null,
  assistantFlashMessageId: '',
  assistantFlashTimeoutId: null,
  chatWarning: null,
  busy: false,
  queueSize: 0,
  drainingQueue: false,
  jobsCount: 0,
  jobs: [],
  jobsTimer: null,
  jobsPopoverOpen: false,
};

const PROCESS_LABELS = {
  creating: 'Creating session',
  sending: 'Sending prompt',
  waiting: 'Waiting provider response',
  persisting: 'Persisting response',
  done: 'Response received',
  stopped: 'Process stopped by user',
};

const messageQueue = createMessageQueue({
  onChange(snapshot) {
    state.queueSize = snapshot.size;
    updateQueueInfo();
    updateSendButtonState();
  },
});

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

function handlePromptKeydown(event) {
  if (event.key !== 'Enter') {
    return;
  }
  if (event.shiftKey || event.isComposing) {
    return;
  }

  event.preventDefault();
  if (els.askForm && typeof els.askForm.requestSubmit === 'function') {
    els.askForm.requestSubmit();
  } else if (els.askForm) {
    els.askForm.dispatchEvent(new Event('submit', { cancelable: true }));
  }
}

function setStatus(message, isError = false, isBusy = false) {
  els.statusText.textContent = `Status: ${message}`;
  els.statusText.classList.toggle('error', isError);
  els.statusText.classList.toggle('busy', !isError && isBusy);
}

function renderJobsIndicator() {
  if (!els.jobIndicator || !els.jobCount) {
    return;
  }
  const count = getDisplayedJobsCount();
  els.jobCount.textContent = String(count);
  els.jobIndicator.classList.toggle('active', count > 0);
}

function formatJobScope(job) {
  if (!job || typeof job !== 'object') {
    return 'Job';
  }

  if (job.type === 'session') {
    const projectId = normalizeText(job.projectId);
    const sessionId = normalizeText(job.sessionId);
    if (projectId && sessionId) {
      return `${projectId} • ${sessionId}`;
    }
    return sessionId || projectId || 'Session job';
  }

  return 'Provider job';
}

function formatJobMeta(job) {
  if (!job || typeof job !== 'object') {
    return '';
  }
  const parts = [];
  if (job.provider) {
    parts.push(`provider ${job.provider}`);
  }
  if (job.model) {
    parts.push(`model ${job.model}`);
  }
  if (job.mode && job.mode !== 'normal') {
    parts.push(`mode ${job.mode}`);
  }
  if (job.reasoning && job.reasoning !== 'medium') {
    parts.push(`reasoning ${job.reasoning}`);
  }
  if (job.startedAt) {
    parts.push(formatRelative(job.startedAt));
  }
  return parts.join(' • ');
}

function renderJobsPopover() {
  if (!els.jobsPopover || !els.jobsPopoverBody) {
    return;
  }

  if (!state.jobsPopoverOpen) {
    els.jobsPopover.classList.add('hidden');
    return;
  }

  const jobs = getDisplayedJobsList();
  els.jobsPopover.classList.remove('hidden');
  els.jobsPopoverBody.innerHTML = '';

  if (jobs.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'small';
    empty.textContent = 'Tidak ada job aktif.';
    els.jobsPopoverBody.appendChild(empty);
    return;
  }

  jobs.forEach((job) => {
    const row = document.createElement('div');
    row.className = 'jobs-row';

    const title = document.createElement('div');
    title.className = 'jobs-title';
    title.textContent = formatJobScope(job);

    const meta = document.createElement('div');
    meta.className = 'jobs-meta';
    meta.textContent = formatJobMeta(job);

    row.append(title, meta);
    els.jobsPopoverBody.appendChild(row);
  });
}

function toggleJobsPopover(forceOpen) {
  if (!els.jobsPopover) {
    return;
  }
  const next = typeof forceOpen === 'boolean' ? forceOpen : !state.jobsPopoverOpen;
  state.jobsPopoverOpen = next;
  renderJobsPopover();
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function getSessionJob(projectId, sessionId) {
  if (!projectId || !sessionId || !Array.isArray(state.jobs)) {
    return null;
  }

  return (
    state.jobs.find((job) => {
      if (!job || typeof job !== 'object') {
        return false;
      }
      return job.type === 'session' && job.projectId === projectId && job.sessionId === sessionId;
    }) || null
  );
}

function hasLocalRunningJob() {
  return Boolean(state.awaitingAssistant && state.activeProjectId && state.activeSessionId);
}

function getDisplayedJobsCount() {
  const serverCount = Number.isFinite(state.jobsCount) ? state.jobsCount : 0;
  if (!hasLocalRunningJob()) {
    return serverCount;
  }

  const trackedByServer = Boolean(getSessionJob(state.activeProjectId, state.activeSessionId));
  return trackedByServer ? serverCount : serverCount + 1;
}

function getDisplayedJobsList() {
  const jobs = Array.isArray(state.jobs) ? [...state.jobs] : [];
  if (!hasLocalRunningJob()) {
    return jobs;
  }

  const trackedByServer = Boolean(getSessionJob(state.activeProjectId, state.activeSessionId));
  if (trackedByServer) {
    return jobs;
  }

  const startedAt =
    state.process && state.process.startedAt
      ? new Date(state.process.startedAt).toISOString()
      : new Date().toISOString();
  jobs.unshift({
    type: 'session',
    projectId: state.activeProjectId,
    sessionId: state.activeSessionId,
    provider: state.activeProvider,
    model: state.preferences.model,
    reasoning: state.preferences.reasoning,
    mode: state.preferences.mode,
    startedAt,
    local: true,
  });
  return jobs;
}

function getLocalSessionActivity(sessionId) {
  if (!state.awaitingAssistant || !state.activeSessionId || sessionId !== state.activeSessionId) {
    return '';
  }

  const label = normalizeText(state.process && state.process.label);
  if (!label) {
    return 'memproses prompt';
  }

  const activityByLabel = {
    [PROCESS_LABELS.creating]: 'membuat session',
    [PROCESS_LABELS.sending]: 'mengirim prompt',
    [PROCESS_LABELS.waiting]: 'menunggu respons provider',
    [PROCESS_LABELS.persisting]: 'menyimpan respons',
  };

  return activityByLabel[label] || label.toLowerCase();
}

function getJobActivity(job) {
  if (!job || typeof job !== 'object') {
    return '';
  }

  const provider = normalizeText(job.provider);
  const model = normalizeText(job.model);
  const mode = normalizeText(job.mode);
  const reasoning = normalizeText(job.reasoning);
  const details = [];

  if (provider) {
    details.push(`provider ${provider}`);
  }
  if (model) {
    details.push(`model ${model}`);
  }
  if (mode && mode !== 'normal') {
    details.push(`mode ${mode}`);
  }
  if (reasoning && reasoning !== 'medium') {
    details.push(`reasoning ${reasoning}`);
  }

  if (details.length === 0) {
    return 'memproses prompt';
  }

  return `memproses prompt (${details.join(', ')})`;
}

function getSessionRuntimeStatus(session) {
  const sessionId = normalizeText(session && session.id);
  if (!sessionId) {
    return { tone: 'normal', label: '' };
  }

  if (state.activeSessionId === sessionId && state.process && state.process.isError) {
    return { tone: 'error', label: 'Error' };
  }

  const localActivity = getLocalSessionActivity(sessionId);
  if (localActivity) {
    if (state.process && state.process.hasEdits) {
      return { tone: 'editing', label: `Editing - ${localActivity}` };
    }
    return { tone: 'running', label: `Running - ${localActivity}` };
  }

  const job = getSessionJob(state.activeProjectId, sessionId);
  if (job) {
    return { tone: 'running', label: `Running - ${getJobActivity(job)}` };
  }

  return { tone: 'normal', label: '' };
}

function refreshSessionRuntimeIndicators() {
  if (!els.sessionList || !Array.isArray(state.sessions) || state.sessions.length === 0) {
    return;
  }

  renderSessionList();
}

async function loadJobsIndicator() {
  try {
    const data = await api.getJobs();
    const jobs = Array.isArray(data.jobs) ? data.jobs : [];
    const count = typeof data.count === 'number' ? data.count : jobs.length;
    state.jobs = jobs;
    state.jobsCount = count;
    renderJobsIndicator();
    renderJobsPopover();
    refreshSessionRuntimeIndicators();
  } catch (_error) {
    // Ignore polling errors.
  }
}

function startJobsPolling() {
  if (!els.jobIndicator) {
    return;
  }
  if (state.jobsTimer) {
    clearInterval(state.jobsTimer);
  }
  loadJobsIndicator();
  state.jobsTimer = setInterval(loadJobsIndicator, 4000);
}

function updateQueueInfo() {
  if (!els.queueInfo) {
    return;
  }

  const total = Number.isFinite(state.queueSize) ? state.queueSize : 0;
  if (total > 0) {
    els.queueInfo.hidden = false;
    els.queueInfo.textContent = `Queue: ${total}`;
  } else {
    els.queueInfo.hidden = true;
    els.queueInfo.textContent = '';
  }
}

function updateSendButtonState() {
  const canSend = state.awaitingAssistant || !state.busy;
  els.sendButton.disabled = !canSend;
  els.sendButton.textContent = '>';
  els.sendButton.classList.remove('stop');

  if (els.stopButton) {
    if (state.awaitingAssistant) {
      els.stopButton.hidden = false;
      els.stopButton.disabled = !state.requestAbortController;
    } else {
      els.stopButton.hidden = true;
      els.stopButton.disabled = true;
    }
  }

}

function normalizePreferences(input) {
  const next = {
    model: '',
    reasoning: 'medium',
    mode: 'normal',
  };

  if (input && typeof input.model === 'string') {
    next.model = input.model.trim();
  }

  if (input && typeof input.reasoning === 'string') {
    const reasoning = input.reasoning.trim();
    if (reasoning === 'standard') {
      next.reasoning = 'medium';
    } else if (reasoning === 'deep') {
      next.reasoning = 'high';
    } else if (['low', 'medium', 'high', 'xhigh'].includes(reasoning)) {
      next.reasoning = reasoning;
    }
  }

  if (input && typeof input.mode === 'string') {
    const mode = input.mode.trim();
    if (mode === 'plan' || mode === 'normal') {
      next.mode = mode;
    }
  }

  return next;
}


function setModelSource(source) {
  state.modelSource = source;
  if (!els.modelSelect || !els.modelInput) {
    return;
  }

  const useSelect = source === 'select';
  if (els.modelSelect.parentElement) {
    els.modelSelect.parentElement.style.display = useSelect ? '' : 'none';
  } else {
    els.modelSelect.style.display = useSelect ? '' : 'none';
  }
  if (els.modelInputWrap) {
    els.modelInputWrap.style.display = useSelect ? 'none' : '';
  } else {
    els.modelInput.style.display = useSelect ? 'none' : '';
  }
}

function renderModelSelect(models, selected) {
  if (!els.modelSelect) {
    return;
  }

  els.modelSelect.innerHTML = '';

  if (!Array.isArray(models) || models.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Model: -';
    els.modelSelect.appendChild(option);
    els.modelSelect.disabled = true;
    updateIconSelectState(els.modelSelect);
    refreshSelectTitles();
    return;
  }

  for (const model of models) {
    const option = document.createElement('option');
    option.value = model;
    option.textContent = `Model: ${model}`;
    els.modelSelect.appendChild(option);
  }

  els.modelSelect.disabled = false;
  if (selected && models.includes(selected)) {
    els.modelSelect.value = selected;
  } else {
    els.modelSelect.value = models[0];
  }
  updateIconSelectState(els.modelSelect);
  refreshSelectTitles();
}

function updateIconSelectState(select) {
  if (!select || !select.parentElement) {
    return;
  }
  select.parentElement.classList.toggle('is-disabled', Boolean(select.disabled));
}

function refreshSelectTitles() {
  const targets = [els.modelSelect, els.reasoningSelect, els.modeSelect];
  for (const select of targets) {
    if (!select || !select.options) {
      continue;
    }
    const option =
      select.selectedIndex >= 0 && select.options.length > select.selectedIndex
        ? select.options[select.selectedIndex]
        : null;
    select.title = option ? option.textContent : '';
  }
}

function getSelectedModelValue() {
  if (state.modelSource === 'select') {
    return els.modelSelect ? els.modelSelect.value.trim() : '';
  }
  return els.modelInput ? els.modelInput.value.trim() : '';
}

function applyPreferencesToControls() {
  if (els.reasoningSelect) {
    els.reasoningSelect.value = state.preferences.reasoning || 'medium';
  }
  if (els.modeSelect) {
    els.modeSelect.value = state.preferences.mode || 'normal';
  }

  if (state.modelSource === 'select') {
    renderModelSelect(state.models, state.preferences.model);
    state.preferences.model = getSelectedModelValue();
  } else if (els.modelInput) {
    els.modelInput.value = state.preferences.model || '';
  }
  refreshSelectTitles();
}

function syncPreferencesFromControls() {
  state.preferences = normalizePreferences({
    model: getSelectedModelValue(),
    reasoning: els.reasoningSelect ? els.reasoningSelect.value : 'medium',
    mode: els.modeSelect ? els.modeSelect.value : 'normal',
  });
  refreshSelectTitles();
}

function setBusy(value) {
  state.busy = value;
  updateSendButtonState();
  updateQueueInfo();
  updateQueueInfo();
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

function addProcessEvent(text) {
  if (!text) {
    return;
  }
  const entry = text.trim();
  if (!entry) {
    return;
  }
  if (/^(Edited|Created|Updated|Deleted|Modified)\b/i.test(text)) {
    state.process.hasEdits = true;
  }
  if (!Array.isArray(state.process.events)) {
    state.process.events = [];
  }
  if (state.process.events.includes(entry)) {
    return;
  }
  state.process.events.push(entry);
  if (state.process.events.length > 120) {
    state.process.events = state.process.events.slice(-120);
  }
}

function addProcessEventsFromResult(result) {
  if (typeof result !== 'string' || result.trim().length === 0) {
    return;
  }

  const lines = result.split('\n').map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    if (
      /^(Edited|Created|Updated|Deleted)\s+\S+/.test(line) ||
      /^Explored\b/i.test(line) ||
      /^Searched\b/i.test(line) ||
      /^Modified\b/i.test(line)
    ) {
      addProcessEvent(line);
    }
  }
}

function addProcessEventsFromCliProgress(progress) {
  if (!Array.isArray(progress) || progress.length === 0) {
    return;
  }

  const seen = new Set();
  for (const item of progress) {
    if (typeof item !== 'string') {
      continue;
    }
    const text = item.trim().replace(/\s+/g, ' ');
    if (!text || seen.has(text)) {
      continue;
    }
    seen.add(text);
    addProcessEvent(`CLI: ${text}`);
  }
}

function stopActiveRequest() {
  if (!state.awaitingAssistant || !state.requestAbortController) {
    return;
  }

  setProcessStep(PROCESS_LABELS.stopped);
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

    const head = document.createElement('div');
    head.className = 'session-row';

    const title = document.createElement('div');
    title.className = 'session-title';
    title.textContent = getSessionDisplayTitle(session);

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'button danger session-delete';
    deleteButton.textContent = 'Hapus';
    deleteButton.disabled = state.busy || state.awaitingAssistant;
    deleteButton.addEventListener('click', (event) => {
      event.stopPropagation();
      deleteSession(session.id);
    });

    const meta = document.createElement('div');
    meta.className = 'small';
    meta.textContent = `${session.messageCount || 0} msg • ${formatRelative(session.updatedAt)}`;

    head.append(title, deleteButton);
    item.append(head, meta);
    item.addEventListener('click', () => onSessionSelect(session.id));
    els.sessionList.appendChild(item);
  });
}

function renderHeader() {
  const project = getSelectedProject();
  const session = state.activeSession;

  els.activeProjectName.textContent = project ? project.name : 'No project selected';
  els.activeSessionName.textContent = session
    ? `${getSessionDisplayTitle(session)} • ${session.id} • ${session.messages.length} messages`
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
  const hasProcess = state.process.active || state.process.isError || state.awaitingAssistant;

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

  if (hasProcess && renderThinkingPanel && getThinkingSnapshot) {
    const box = document.createElement('article');
    box.className = `message assistant typing enter thinking-live${state.process.isError ? ' error' : ' active'}`;

    const meta = document.createElement('div');
    meta.className = 'message-meta hidden';

    const content = document.createElement('div');
    content.className = 'message-content';
    content.innerHTML = renderThinkingPanel(getThinkingSnapshot());

    box.append(meta, content);
    els.chatLog.appendChild(box);
  }

  renderJobsIndicator();
  scrollChatToBottom();
}

let processUI = null;
let getThinkingSnapshot = null;
let renderThinkingPanel = null;

processUI = createProcessUI({
  chatLog: els.chatLog,
  processState: state.process,
  renderMessages,
  labels: PROCESS_LABELS,
});

getThinkingSnapshot = processUI.getSnapshot;
renderThinkingPanel = processUI.renderThinkingPanel;

function setProcessStep(label) {
  state.process.label = label;
  if (state.process.startedAt > 0) {
    state.process.elapsedMs = Date.now() - state.process.startedAt;
  }
  refreshSessionRuntimeIndicators();
  renderMessages();
}

function startProcess(label = PROCESS_LABELS.waiting) {
  state.process.active = true;
  state.process.label = label;
  state.process.startedAt = Date.now();
  state.process.elapsedMs = 0;
  state.process.isError = false;
  state.process.visible = false;
  state.process.exiting = false;
  state.process.events = [];
  state.process.showAll = false;
  renderMessages();
}

function stopProcess({ isError = false, finalLabel = '' } = {}) {
  state.process.active = false;
  state.process.isError = isError;
  if (finalLabel) {
    state.process.label = finalLabel;
  }
  if (state.process.startedAt > 0) {
    state.process.elapsedMs = Date.now() - state.process.startedAt;
  }
  state.process.visible = false;
  state.process.exiting = false;
  renderMessages();
}

async function loadMetaAndSettings() {
  const meta = await api.getMeta();
  state.providers = meta.providers || [];
  const primaryFromSettings =
    meta.settings && typeof meta.settings.aiPrimary === 'string' ? meta.settings.aiPrimary : '';
  state.defaultProvider =
    primaryFromSettings && state.providers.includes(primaryFromSettings)
      ? primaryFromSettings
      : typeof meta.defaultProvider === 'string'
        ? meta.defaultProvider
        : 'codex';
  state.masterProjectRoot =
    meta.settings && typeof meta.settings.masterProjectRoot === 'string'
      ? meta.settings.masterProjectRoot
      : '';
  renderMasterProjectRoot();
  setMasterRootLockState(true);

  const providerToUse = state.providers.includes(state.defaultProvider)
    ? state.defaultProvider
    : state.providers[0] || '';
  state.activeProvider = providerToUse;

  const theme = meta.settings && meta.settings.theme ? meta.settings.theme : 'aether';
  applyTheme(theme);
}

async function loadModelsForProvider(provider) {
  if (!provider) {
    state.models = [];
    setModelSource('manual');
    applyPreferencesToControls();
    return;
  }

  try {
    const data = await api.getModels(provider);
    const models = Array.isArray(data.models) ? data.models : [];
    state.models = models;
    if (models.length > 0) {
      setModelSource('select');
    } else {
      setModelSource('manual');
    }
    applyPreferencesToControls();
  } catch (_error) {
    state.models = [];
    setModelSource('manual');
    applyPreferencesToControls();
  }
}

function applySessionPreferences(session) {
  const next = session && session.preferences ? normalizePreferences(session.preferences) : normalizePreferences({});
  state.preferences = next;
  applyPreferencesToControls();
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
    await loadSessions(state.activeProjectId, { autoSelect: false, useStored: false });
  } else {
    state.sessions = [];
    state.activeSessionId = '';
    state.activeSession = null;
    applySessionPreferences(null);
    renderSessionList();
    renderHeader();
    renderMessages();
  }
}

async function loadSessions(projectId, options = {}) {
  const { autoSelect = true, useStored = true } = options;
  const data = await api.getSessions(projectId);
  state.sessions = data.sessions || [];

  let nextActiveId = state.activeSessionId;
  if (useStored) {
    const stored = localStorage.getItem(`activeSessionId:${projectId}`);
    if (stored && state.sessions.some((session) => session.id === stored)) {
      nextActiveId = stored;
    }
  }

  const hasActive = nextActiveId && state.sessions.some((session) => session.id === nextActiveId);
  if (!hasActive) {
    if (autoSelect && state.sessions[0]) {
      nextActiveId = state.sessions[0].id;
    } else {
      nextActiveId = '';
    }
  }

  state.activeSessionId = nextActiveId;

  renderSessionList();

  if (state.activeSessionId) {
    await onSessionSelect(state.activeSessionId, false);
  } else {
    state.activeSession = null;
    applySessionPreferences(null);
    renderHeader();
    renderMessages();
  }
}

async function onSessionSelect(sessionId, shouldRenderList = true) {
  if ((state.awaitingAssistant || state.queueSize > 0) && sessionId !== state.activeSessionId) {
    setStatus('proses tetap berjalan di background', false, true);
  }

  state.activeSessionId = sessionId;
  localStorage.setItem(`activeSessionId:${state.activeProjectId}`, sessionId);
  state.assistantFlashMessageId = '';
  state.chatWarning = null;

  const data = await api.getSession(state.activeProjectId, sessionId);
  state.activeSession = data.session;
  applySessionPreferences(state.activeSession);

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
  addProcessEvent('Creating session');

  try {
    const data = await api.createSession(state.activeProjectId, { title });
    state.activeSessionId = data.session.id;
    localStorage.setItem(`activeSessionId:${state.activeProjectId}`, state.activeSessionId);
    els.sessionTitle.value = '';

    await loadSessions(state.activeProjectId);
    const project = getSelectedProject();
    const projectPath = project && project.projectPath ? project.projectPath : '-';
    setStatus(`session created: ${state.activeSessionId} | path: ${projectPath}`);
    addProcessEvent(`Created session ${state.activeSessionId}`);
  } catch (error) {
    setStatus(error.message || 'failed to create session', true);
  } finally {
    setBusy(false);
  }
}

async function deleteSession(sessionId) {
  if (!state.activeProjectId) {
    setStatus('select project first', true);
    return;
  }

  if (state.awaitingAssistant || state.queueSize > 0) {
    setStatus('tunggu proses aktif/antrean selesai dulu', true);
    return;
  }

  if (state.busy) {
    return;
  }

  const session = state.sessions.find((item) => item.id === sessionId);
  const label = session && session.title ? session.title : sessionId;
  const confirmed = window.confirm(`Hapus session "${label}"?`);
  if (!confirmed) {
    return;
  }

  setBusy(true);
  setStatus('menghapus session...', false, true);

  try {
    await api.deleteSession(state.activeProjectId, sessionId);
    if (state.activeSessionId === sessionId) {
      state.activeSessionId = '';
      state.activeSession = null;
      state.chatWarning = null;
    }
    await loadSessions(state.activeProjectId);
    setStatus('session dihapus');
  } catch (error) {
    setStatus(error.message || 'gagal menghapus session', true);
  } finally {
    setBusy(false);
  }
}

function getSessionDisplayTitle(session) {
  if (!session || typeof session !== 'object') {
    return 'Session';
  }
  const raw = typeof session.title === 'string' ? session.title.trim() : '';
  if (raw) {
    return raw;
  }
  if (session.createdAt) {
    return `Session ${formatRelative(session.createdAt)}`;
  }
  return 'Session';
}

function deriveSessionTitleFromPrompt(prompt) {
  const raw = typeof prompt === 'string' ? prompt.trim() : '';
  if (!raw) {
    return '';
  }
  const firstLine = raw
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0) || raw;
  const cleaned = firstLine.replace(/^#+\s*/, '').replace(/^[-*]\s+/, '');
  const max = 60;
  if (cleaned.length <= max) {
    return cleaned;
  }
  return `${cleaned.slice(0, Math.max(0, max - 3)).trim()}...`;
}

async function autoTitleSessionFromPrompt(prompt) {
  const session = state.activeSession;
  if (!session || typeof session !== 'object') {
    return;
  }
  const hasTitle = typeof session.title === 'string' && session.title.trim().length > 0;
  const hasMessages = Array.isArray(session.messages) && session.messages.length > 0;
  if (hasTitle || hasMessages) {
    return;
  }

  const nextTitle = deriveSessionTitleFromPrompt(prompt);
  if (!nextTitle) {
    return;
  }

  session.title = nextTitle;
  renderSessionList();
  renderHeader();

  try {
    const data = await api.updateSession(state.activeProjectId, session.id, { title: nextTitle });
    if (data && data.session) {
      state.activeSession = data.session;
    }
  } catch (_error) {
    // Silent fail: title update should not block prompt.
  }
}

async function ensureSessionForPrompt(prompt = '') {
  if (state.activeSessionId) {
    return state.activeSessionId;
  }

  if (!state.activeProjectId) {
    throw new Error('create/select project first');
  }

  setStatus('membuat session otomatis...', false, true);
  const title = deriveSessionTitleFromPrompt(prompt);
  const data = await api.createSession(state.activeProjectId, { title });
  state.activeSessionId = data.session.id;
  localStorage.setItem(`activeSessionId:${state.activeProjectId}`, state.activeSessionId);
  state.activeSession = data.session;
  await loadSessions(state.activeProjectId);
  return state.activeSessionId;
}

async function executePromptJob(job) {
  if (!job || typeof job.prompt !== 'string') {
    return;
  }

  const prompt = job.prompt.trim();
  if (!prompt) {
    return;
  }

  const provider = job.provider || state.activeProvider;
  const projectId = job.projectId || state.activeProjectId;
  const sessionId = job.sessionId || state.activeSessionId;

  state.chatWarning = null;
  state.preferences = normalizePreferences({
    model: job.model,
    reasoning: job.reasoning,
    mode: job.mode,
  });
  setBusy(true);
  state.awaitingAssistant = true;
  state.process.hasEdits = false;
  updateSendButtonState();
  renderJobsIndicator();
  setStatus('neural pipeline active...', false, true);
  startProcess(PROCESS_LABELS.creating);
  refreshSessionRuntimeIndicators();
  addProcessEvent(`Sending prompt to ${provider}`);

  try {
    const controller = new AbortController();
    state.requestAbortController = controller;
    updateSendButtonState();

    if (state.activeSession && state.activeSession.id === sessionId) {
      await autoTitleSessionFromPrompt(prompt);
    }
    if (controller.signal.aborted) {
      throw createAbortError();
    }
    setProcessStep(PROCESS_LABELS.sending);
    const optimisticMessage = {
      id: `temp-${Date.now().toString(36)}`,
      role: 'user',
      provider,
      content: prompt,
      model: state.preferences.model,
      reasoning: state.preferences.reasoning,
      mode: state.preferences.mode,
      createdAt: new Date().toISOString(),
    };

    const isViewingSession = state.activeProjectId === projectId && state.activeSessionId === sessionId;
    if (isViewingSession) {
      if (!state.activeSession || state.activeSession.id !== sessionId) {
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
    }
    setProcessStep(PROCESS_LABELS.waiting);
    void loadJobsIndicator();

    const data = await api.askInSession(
      projectId,
      sessionId,
      {
        prompt,
        provider,
        model: state.preferences.model,
        reasoning: state.preferences.reasoning,
        mode: state.preferences.mode,
      },
      { signal: controller.signal },
    );
    state.requestAbortController = null;
    setProcessStep(PROCESS_LABELS.persisting);
    const stillViewingSession = state.activeProjectId === projectId && state.activeSessionId === sessionId;
    if (stillViewingSession) {
      state.activeSession = data.session;
    }

    if (projectId === state.activeProjectId) {
      await loadSessions(projectId);
    }
    stopProcess({ finalLabel: PROCESS_LABELS.done });
    refreshSessionRuntimeIndicators();
    addProcessEventsFromCliProgress(data.progress);
    addProcessEventsFromResult(data.result);
    addProcessEvent('Saved response');
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
    if (stillViewingSession) {
      const latestAssistant = Array.isArray(state.activeSession && state.activeSession.messages)
        ? [...state.activeSession.messages].reverse().find((item) => item.role === 'assistant')
        : null;
      scheduleAssistantFlash(latestAssistant && latestAssistant.id ? latestAssistant.id : '');
      setStatus('response received');
    } else {
      setStatus('response received (background)', false, false);
    }
  } catch (error) {
    state.requestAbortController = null;
    const aborted = isAbortError(error);

    if (projectId === state.activeProjectId && sessionId === state.activeSessionId) {
      try {
        await onSessionSelect(sessionId);
      } catch (_innerError) {
        // Keep current local state when refresh fails.
      }
    }

    if (aborted) {
      stopProcess();
      refreshSessionRuntimeIndicators();
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
      stopProcess({
        isError: true,
        finalLabel:
          state.chatWarning.code !== null
            ? `Provider error (code ${state.chatWarning.code})`
            : 'Provider error',
      });
      refreshSessionRuntimeIndicators();
      setStatus(error.message || 'request failed', true);
    }
  } finally {
    state.awaitingAssistant = false;
    setBusy(false);
    if (!state.process.isError) {
      stopProcess();
    }
    refreshSessionRuntimeIndicators();
    void loadJobsIndicator();
    renderJobsIndicator();
    renderHeader();
    renderMessages();
    updateSendButtonState();
  }
}

async function drainPromptQueue() {
  if (state.drainingQueue || state.awaitingAssistant) {
    return;
  }

  state.drainingQueue = true;
  try {
    while (!state.awaitingAssistant && messageQueue.size() > 0) {
      const job = messageQueue.dequeue();
      if (!job) {
        break;
      }
      await executePromptJob(job);
    }
  } finally {
    state.drainingQueue = false;
    updateQueueInfo();
    updateSendButtonState();
  }
}

async function sendPrompt(event) {
  event.preventDefault();

  const prompt = els.promptInput.value.trim();
  const provider = state.activeProvider;
  const reasoning = els.reasoningSelect ? els.reasoningSelect.value : 'medium';
  const mode = els.modeSelect ? els.modeSelect.value : 'normal';
  const model = getSelectedModelValue();

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

  if (state.busy && !state.awaitingAssistant) {
    return;
  }

  let sessionId = '';
  try {
    sessionId = await ensureSessionForPrompt(prompt);
  } catch (error) {
    setStatus(error.message || 'create session in Settings first', true);
    return;
  }

  const job = {
    prompt,
    provider,
    model,
    reasoning,
    mode,
    projectId: state.activeProjectId,
    sessionId,
  };

  if (els.promptInput) {
    els.promptInput.value = '';
  }

  messageQueue.enqueue(job);
  if (state.awaitingAssistant) {
    setStatus(`prompt dimasukkan ke antrean (${state.queueSize})`, false, true);
    addProcessEvent(`Queued prompt (${state.queueSize})`);
  } else {
    setStatus('prompt ditambahkan ke antrean', false, true);
  }

  void drainPromptQueue();
}

async function onProjectSelectChange() {
  if (state.awaitingAssistant || state.queueSize > 0) {
    els.projectSelect.value = state.activeProjectId;
    setStatus('selesaikan proses/antrean dulu sebelum pindah project', true);
    return;
  }

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
    await loadModelsForProvider(state.activeProvider);
    await loadProjects();
    startJobsPolling();
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
  if (els.stopButton) {
    els.stopButton.addEventListener('click', stopActiveRequest);
  }
  if (els.modelSelect) {
    els.modelSelect.addEventListener('change', syncPreferencesFromControls);
  }
  if (els.modelInput) {
    els.modelInput.addEventListener('input', syncPreferencesFromControls);
  }
  if (els.reasoningSelect) {
    els.reasoningSelect.addEventListener('change', syncPreferencesFromControls);
  }
  if (els.modeSelect) {
    els.modeSelect.addEventListener('change', syncPreferencesFromControls);
  }
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
  if (els.promptInput) {
    els.promptInput.addEventListener('keydown', handlePromptKeydown);
  }
  if (els.jobIndicator) {
    els.jobIndicator.addEventListener('click', (event) => {
      event.stopPropagation();
      toggleJobsPopover();
    });
  }
  if (els.jobsPopoverClose) {
    els.jobsPopoverClose.addEventListener('click', () => toggleJobsPopover(false));
  }
  document.addEventListener('click', (event) => {
    if (!state.jobsPopoverOpen) {
      return;
    }
    const inside =
      (els.jobsPopover && els.jobsPopover.contains(event.target)) ||
      (els.jobIndicator && els.jobIndicator.contains(event.target));
    if (!inside) {
      toggleJobsPopover(false);
    }
  });
  window.addEventListener('resize', handleWindowResize);
}

init();
