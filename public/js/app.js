import { api } from './api.js';
import { applyTheme, formatRelative } from './theme.js';
import { createProcessUI } from './process-ui.js';
import { createMessageQueue } from './message-queue.js';
import { buildAssistantMessage, buildUserMessage } from './message-components.js';

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
  undoButton: document.getElementById('undoButton'),
  sendButton: document.getElementById('sendButton'),
  stopButton: document.getElementById('stopButton'),
  processInline: document.getElementById('processInline'),
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
    projectId: '',
    sessionId: '',
  },
  requestAbortController: null,
  assistantFlashMessageId: '',
  assistantFlashTimeoutId: null,
  chatWarning: null,
  busy: false,
  queueSize: 0,
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

const sessionQueues = new Map();
const sessionQueueState = new Map();
const localAwaitingBySession = new Map();
const serverAwaitingBySession = new Map();
const abortControllersBySession = new Map();
const inflightPromptKeys = new Map();
const sessionDomCache = new Map();

const CHAT_WINDOW_SIZE = 80;
const CHAT_WINDOW_STEP = 50;
const SESSION_DOM_CACHE_LIMIT = 12;
const COMPOSER_COLLAPSE_THRESHOLD = 64;

let composerCollapsed = false;
let composerInputFocused = false;

function setComposerCollapsed(collapsed) {
  if (composerCollapsed === collapsed || !els.askForm) return;
  composerCollapsed = collapsed;
  els.askForm.classList.toggle('composer--collapsed', collapsed);
}

function createRenderCacheState() {
  return {
    initialized: false,
    sessionId: '',
    totalMessageCount: 0,
    visibleStart: 0,
    visibleEnd: 0,
    lastVisibleMessageKey: '',
    lastSessionUpdatedAt: '',
    warningKey: '',
    assistantFlashId: '',
    empty: false,
  };
}

function createSessionDomState(sessionId) {
  const root = document.createElement('div');
  root.className = 'chat-session-view';
  root.style.display = 'flex';
  root.style.flexDirection = 'column';
  root.style.gap = '16px';

  const messageList = document.createElement('div');
  messageList.className = 'chat-session-messages';
  messageList.style.display = 'flex';
  messageList.style.flexDirection = 'column';
  messageList.style.gap = '16px';

  const footer = document.createElement('div');
  footer.className = 'chat-session-footer';
  footer.style.display = 'flex';
  footer.style.flexDirection = 'column';
  footer.style.gap = '16px';

  root.append(messageList, footer);

  return {
    sessionId,
    root,
    messageList,
    footer,
    renderCache: createRenderCacheState(),
    scrollTop: 0,
    mounted: false,
    loadingOlder: false,
    pendingPrependRestore: null,
  };
}

function trimSessionDomCache(activeSessionId = '') {
  while (sessionDomCache.size > SESSION_DOM_CACHE_LIMIT) {
    let removed = false;
    for (const key of sessionDomCache.keys()) {
      if (!key || key === activeSessionId) {
        continue;
      }
      sessionDomCache.delete(key);
      removed = true;
      break;
    }
    if (!removed) {
      break;
    }
  }
}

function getSessionDomState(sessionId) {
  if (!sessionId) {
    return null;
  }

  let entry = sessionDomCache.get(sessionId);
  if (!entry) {
    entry = createSessionDomState(sessionId);
    sessionDomCache.set(sessionId, entry);
    trimSessionDomCache(sessionId);
    return entry;
  }

  sessionDomCache.delete(sessionId);
  sessionDomCache.set(sessionId, entry);
  return entry;
}

function mountSessionDomState(sessionId) {
  const entry = getSessionDomState(sessionId);
  if (!entry) {
    return null;
  }

  if (
    entry.mounted &&
    entry.root.parentNode === els.chatLog &&
    els.emptyState.parentNode !== els.chatLog
  ) {
    return entry;
  }

  for (const domState of sessionDomCache.values()) {
    if (!domState || !domState.mounted) {
      continue;
    }
    domState.scrollTop = els.chatLog.scrollTop;
    domState.mounted = false;
    if (domState.root.parentNode === els.chatLog) {
      els.chatLog.removeChild(domState.root);
    }
  }

  if (els.emptyState.parentNode === els.chatLog) {
    els.chatLog.removeChild(els.emptyState);
  }

  els.chatLog.innerHTML = '';
  els.chatLog.appendChild(entry.root);
  entry.mounted = true;
  els.chatLog.scrollTop = entry.scrollTop || 0;
  return entry;
}

function restorePrependScroll(domState) {
  if (!domState || !domState.pendingPrependRestore) {
    return false;
  }

  const previous = domState.pendingPrependRestore;
  domState.pendingPrependRestore = null;
  const delta = els.chatLog.scrollHeight - previous.scrollHeight;
  els.chatLog.scrollTop = previous.scrollTop + Math.max(0, delta);
  return true;
}

function ensureVisibleWindow(domState, totalMessageCount, shouldStickToBottom, force = false) {
  if (!domState) {
    return { start: 0, end: totalMessageCount };
  }

  const cache = domState.renderCache;
  const hasRange = cache.initialized && cache.visibleEnd >= cache.visibleStart;
  const oldVisibleCount = hasRange ? cache.visibleEnd - cache.visibleStart : 0;
  const baseWindow = Math.max(oldVisibleCount, CHAT_WINDOW_SIZE);

  if (!hasRange || force || cache.sessionId !== domState.sessionId || totalMessageCount < cache.totalMessageCount) {
    const start = Math.max(0, totalMessageCount - CHAT_WINDOW_SIZE);
    cache.visibleStart = start;
    cache.visibleEnd = totalMessageCount;
    return { start, end: totalMessageCount };
  }

  if (cache.visibleEnd > totalMessageCount) {
    cache.visibleEnd = totalMessageCount;
  }

  if (cache.visibleEnd < totalMessageCount) {
    if (shouldStickToBottom) {
      cache.visibleEnd = totalMessageCount;
      cache.visibleStart = Math.max(0, totalMessageCount - baseWindow);
    } else {
      cache.visibleEnd = totalMessageCount;
    }
  }

  if (cache.visibleStart > cache.visibleEnd) {
    cache.visibleStart = Math.max(0, cache.visibleEnd - CHAT_WINDOW_SIZE);
  }

  return { start: cache.visibleStart, end: cache.visibleEnd };
}

function loadOlderMessagesForActiveSession() {
  const sessionId = state.activeSessionId;
  const session = state.activeSession;
  if (!sessionId || !session || !Array.isArray(session.messages) || session.messages.length === 0) {
    return;
  }

  const domState = getSessionDomState(sessionId);
  if (!domState || domState.loadingOlder) {
    return;
  }

  const cache = domState.renderCache;
  if (!cache.initialized || cache.visibleStart <= 0) {
    return;
  }

  domState.loadingOlder = true;
  domState.pendingPrependRestore = {
    scrollHeight: els.chatLog.scrollHeight,
    scrollTop: els.chatLog.scrollTop,
  };
  cache.visibleStart = Math.max(0, cache.visibleStart - CHAT_WINDOW_STEP);
  renderMessages({ force: true });
}

function handleChatScroll() {
  const domState = getSessionDomState(state.activeSessionId);
  if (!domState || !domState.mounted) {
    return;
  }

  const { scrollTop, scrollHeight, clientHeight } = els.chatLog;
  domState.scrollTop = scrollTop;

  if (scrollTop <= 120) {
    loadOlderMessagesForActiveSession();
  }

  if (!composerInputFocused) {
    setComposerCollapsed(scrollHeight - scrollTop - clientHeight > COMPOSER_COLLAPSE_THRESHOLD);
  }
}

function getQueueKey(projectId, sessionId) {
  if (!projectId || !sessionId) {
    return '';
  }
  return `${projectId}::${sessionId}`;
}

function isSessionAwaiting(projectId, sessionId) {
  const key = getQueueKey(projectId, sessionId);
  if (!key) {
    return false;
  }
  return localAwaitingBySession.has(key) || serverAwaitingBySession.has(key);
}

function setLocalAwaiting(projectId, sessionId, value) {
  const key = getQueueKey(projectId, sessionId);
  if (!key) {
    return;
  }
  if (value) {
    localAwaitingBySession.set(key, true);
  } else {
    localAwaitingBySession.delete(key);
  }
  if (projectId === state.activeProjectId && sessionId === state.activeSessionId) {
    state.awaitingAssistant = isSessionAwaiting(projectId, sessionId);
    updateSendButtonState();
  }
}

function setAbortController(projectId, sessionId, controller) {
  const key = getQueueKey(projectId, sessionId);
  if (!key) {
    return;
  }
  if (controller) {
    abortControllersBySession.set(key, controller);
  } else {
    abortControllersBySession.delete(key);
  }
  if (projectId === state.activeProjectId && sessionId === state.activeSessionId) {
    state.requestAbortController = controller || null;
    updateSendButtonState();
  }
}

function setServerAwaitingFromJobs(jobs) {
  serverAwaitingBySession.clear();
  if (!Array.isArray(jobs)) {
    return;
  }
  jobs.forEach((job) => {
    if (!job || job.type !== 'session') {
      return;
    }
    const key = getQueueKey(job.projectId, job.sessionId);
    if (key) {
      serverAwaitingBySession.set(key, true);
    }
  });
}

function isActiveAwaiting() {
  return isSessionAwaiting(state.activeProjectId, state.activeSessionId);
}

function hasOtherSessionActivity(projectId, sessionId) {
  const currentKey = getQueueKey(projectId, sessionId);
  for (const key of localAwaitingBySession.keys()) {
    if (key !== currentKey) {
      return true;
    }
  }
  for (const key of serverAwaitingBySession.keys()) {
    if (key !== currentKey) {
      return true;
    }
  }
  for (const [key, queue] of sessionQueues.entries()) {
    if (key === currentKey) {
      continue;
    }
    if (queue && queue.size() > 0) {
      return true;
    }
  }
  return false;
}

function isSessionBusy(projectId, sessionId) {
  if (isSessionAwaiting(projectId, sessionId)) {
    return true;
  }
  const key = getQueueKey(projectId, sessionId);
  if (key && sessionQueues.has(key)) {
    return sessionQueues.get(key).size() > 0;
  }
  return false;
}

function makePromptKey({ projectId, sessionId, provider, model, reasoning, mode, prompt }) {
  return [
    projectId || '',
    sessionId || '',
    provider || '',
    model || '',
    reasoning || '',
    mode || '',
    prompt || '',
  ].join('::');
}

function getQueueState(projectId, sessionId) {
  const key = getQueueKey(projectId, sessionId);
  if (!key) {
    return null;
  }

  if (!sessionQueues.has(key)) {
    const queue = createMessageQueue({
      onChange(snapshot) {
        if (state.activeProjectId === projectId && state.activeSessionId === sessionId) {
          state.queueSize = snapshot.size;
          updateQueueInfo();
          updateSendButtonState();
        }
      },
    });
    sessionQueues.set(key, queue);
    sessionQueueState.set(key, { draining: false });
  }

  return {
    key,
    queue: sessionQueues.get(key),
    state: sessionQueueState.get(key),
  };
}

function syncActiveQueueSize() {
  const entry = getQueueState(state.activeProjectId, state.activeSessionId);
  state.queueSize = entry ? entry.queue.size() : 0;
  updateQueueInfo();
  updateSendButtonState();
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

function handlePromptKeydown(event) {
  if (event.key !== 'Enter') {
    return;
  }
  if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) {
    return;
  }

  event.preventDefault();
  if (els.askForm && typeof els.askForm.requestSubmit === 'function') {
    els.askForm.requestSubmit();
  } else if (els.askForm) {
    els.askForm.dispatchEvent(new Event('submit', { cancelable: true }));
  }
}

function handlePromptBeforeInput(event) {
  if (!event || typeof event.inputType !== 'string') {
    return;
  }

  if (event.inputType === 'historyUndo' || event.inputType === 'historyRedo') {
    event.stopPropagation();
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

  // Diff-based update: avoid clearing all nodes if jobs haven't changed
  const prevRows = els.jobsPopoverBody.querySelectorAll('[data-job-key]');
  const prevKeys = new Set([...prevRows].map((r) => r.dataset.jobKey));
  const nextKeys = new Set(jobs.map((job) => `${job.projectId}|${job.sessionId}|${job.status}`));
  const unchanged = prevKeys.size === nextKeys.size && [...prevKeys].every((k) => nextKeys.has(k));
  if (unchanged) {
    return;
  }

  els.jobsPopoverBody.innerHTML = '';

  if (jobs.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'small';
    empty.textContent = 'Tidak ada job aktif.';
    els.jobsPopoverBody.appendChild(empty);
    return;
  }

  const frag = document.createDocumentFragment();
  jobs.forEach((job) => {
    const row = document.createElement('div');
    row.className = 'jobs-row';
    row.dataset.jobKey = `${job.projectId}|${job.sessionId}|${job.status}`;

    const title = document.createElement('div');
    title.className = 'jobs-title';
    title.textContent = formatJobScope(job);

    const meta = document.createElement('div');
    meta.className = 'jobs-meta';
    meta.textContent = formatJobMeta(job);

    row.append(title, meta);
    frag.appendChild(row);
  });
  els.jobsPopoverBody.appendChild(frag);
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
  const key = getQueueKey(state.process.projectId, state.process.sessionId);
  return Boolean(key && localAwaitingBySession.has(key));
}

function getDisplayedJobsCount() {
  const serverCount = Number.isFinite(state.jobsCount) ? state.jobsCount : 0;
  if (!hasLocalRunningJob()) {
    return serverCount;
  }

  const trackedByServer = Boolean(getSessionJob(state.process.projectId, state.process.sessionId));
  return trackedByServer ? serverCount : serverCount + 1;
}

function getDisplayedJobsList() {
  const jobs = Array.isArray(state.jobs) ? [...state.jobs] : [];
  if (!hasLocalRunningJob()) {
    return jobs;
  }

  const trackedByServer = Boolean(getSessionJob(state.process.projectId, state.process.sessionId));
  if (trackedByServer) {
    return jobs;
  }

  const startedAt =
    state.process && state.process.startedAt
      ? new Date(state.process.startedAt).toISOString()
      : new Date().toISOString();
  jobs.unshift({
    type: 'session',
    projectId: state.process.projectId,
    sessionId: state.process.sessionId,
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
  if (
    !isActiveAwaiting() ||
    !state.process.sessionId ||
    !state.process.projectId ||
    state.process.projectId !== state.activeProjectId ||
    sessionId !== state.process.sessionId
  ) {
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

  const items = els.sessionList.querySelectorAll('.session-item');
  if (!items.length) {
    renderSessionList();
    return;
  }

  items.forEach((item) => {
    const sessionId = item.dataset.sessionId;
    const session = state.sessions.find((entry) => entry.id === sessionId);
    if (!session) {
      return;
    }

    item.classList.toggle('active', sessionId === state.activeSessionId);

    const runtime = getSessionRuntimeStatus(session);
    const runtimeDot = item.querySelector('.session-runtime');
    if (runtimeDot) {
      runtimeDot.className = `session-runtime${runtime && runtime.tone ? ` ${runtime.tone}` : ''}`;
      runtimeDot.title = runtime && runtime.label ? runtime.label : 'Idle';
    }

    const meta = item.querySelector('.small');
    if (meta) {
      const statusSuffix = runtime && runtime.label ? ` • ${runtime.label}` : '';
      meta.textContent = `${session.messageCount || 0} msg • ${formatRelative(session.updatedAt)}${statusSuffix}`;
    }

    const deleteButton = item.querySelector('.session-delete');
    if (deleteButton) {
      deleteButton.disabled = state.busy || isSessionBusy(state.activeProjectId, sessionId);
    }
  });
}

async function loadJobsIndicator() {
  try {
    const data = await api.getJobs();
    const jobs = Array.isArray(data.jobs) ? data.jobs : [];
    const count = typeof data.count === 'number' ? data.count : jobs.length;
    state.jobs = jobs;
    state.jobsCount = count;
    setServerAwaitingFromJobs(jobs);
    syncProcessFromJobs();
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
  const canSend = isActiveAwaiting() || !state.busy;
  els.sendButton.disabled = !canSend;
  els.sendButton.textContent = '>';
  els.sendButton.classList.remove('stop');

  if (els.undoButton) {
    const hasMessages =
      Boolean(state.activeSession) &&
      Array.isArray(state.activeSession.messages) &&
      state.activeSession.messages.length > 0;
    els.undoButton.disabled = !state.activeProjectId || !state.activeSessionId || !hasMessages || state.busy || isActiveAwaiting();
  }

  if (els.stopButton) {
    if (isActiveAwaiting()) {
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
  if (!isActiveAwaiting() || !state.requestAbortController) {
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

function getSessionSummary(sessionId) {
  if (!sessionId || !Array.isArray(state.sessions)) {
    return null;
  }
  return state.sessions.find((session) => session.id === sessionId) || null;
}

function canReuseActiveSession(sessionId) {
  if (!sessionId || !state.activeSession || state.activeSession.id !== sessionId) {
    return false;
  }

  const summary = getSessionSummary(sessionId);
  if (!summary) {
    return false;
  }

  const activeUpdatedAt =
    typeof state.activeSession.updatedAt === 'string' ? state.activeSession.updatedAt : '';
  const summaryUpdatedAt = typeof summary.updatedAt === 'string' ? summary.updatedAt : '';
  const activeMessageCount = Array.isArray(state.activeSession.messages)
    ? state.activeSession.messages.length
    : 0;
  const summaryMessageCount = Number.isFinite(summary.messageCount) ? summary.messageCount : 0;

  return activeUpdatedAt === summaryUpdatedAt && activeMessageCount === summaryMessageCount;
}

function getMessageKey(message, index) {
  if (!message || typeof message !== 'object') {
    return `unknown-${index}`;
  }

  const id = typeof message.id === 'string' ? message.id : '';
  const role = typeof message.role === 'string' ? message.role : '';
  const createdAt = typeof message.createdAt === 'string' ? message.createdAt : '';
  const content =
    typeof message.content === 'string' ? message.content.trim().slice(0, 32) : '';

  return `${id}|${role}|${createdAt}|${content}`;
}

function getWarningKey(warning) {
  if (!warning || typeof warning !== 'object') {
    return '';
  }
  return [
    warning.level || '',
    warning.provider || '',
    warning.code === null || typeof warning.code === 'undefined' ? '' : String(warning.code),
    warning.title || '',
    warning.details || '',
    warning.hint || '',
    warning.createdAt || '',
  ].join('|');
}

function isNearBottom(container, threshold = 80) {
  if (!container) {
    return false;
  }
  const distance = container.scrollHeight - container.scrollTop - container.clientHeight;
  return distance <= threshold;
}

function escapeSelector(value) {
  if (typeof value !== 'string') {
    return '';
  }
  if (typeof window !== 'undefined' && window.CSS && typeof window.CSS.escape === 'function') {
    return window.CSS.escape(value);
  }
  return value.replace(/[\"\\]/g, '\\$&');
}

function buildWarningNode(warning) {
  const warningBox = document.createElement('article');
  const level = warning.level === 'info' ? 'info' : 'error';
  warningBox.className = `message warning ${level} enter`;
  warningBox.dataset.role = 'warning';

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
  return warningBox;
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

function renderSessionItem(session, index) {
  const item = document.createElement('li');
  item.className = `session-item enter${session.id === state.activeSessionId ? ' active' : ''}`;
  item.style.animationDelay = `${Math.min(index * 24, 120)}ms`;
  item.dataset.sessionId = session.id;

  const head = document.createElement('div');
  head.className = 'session-row';

  const runtime = getSessionRuntimeStatus(session);
  const runtimeDot = document.createElement('span');
  runtimeDot.className = `session-runtime${runtime && runtime.tone ? ` ${runtime.tone}` : ''}`;
  runtimeDot.title = runtime && runtime.label ? runtime.label : 'Idle';

  const titleWrap = document.createElement('div');
  titleWrap.className = 'session-title-wrap';

  const title = document.createElement('div');
  title.className = 'session-title';
  title.textContent = getSessionDisplayTitle(session);
  titleWrap.append(runtimeDot, title);

  const deleteButton = document.createElement('button');
  deleteButton.type = 'button';
  deleteButton.className = 'button danger session-delete';
  deleteButton.textContent = 'Hapus';
  deleteButton.disabled = state.busy || isSessionBusy(state.activeProjectId, session.id);
  deleteButton.addEventListener('click', (event) => {
    event.stopPropagation();
    deleteSession(session.id);
  });

  head.append(titleWrap, deleteButton);

  const meta = document.createElement('div');
  meta.className = 'small';
  const statusSuffix = runtime && runtime.label ? ` • ${runtime.label}` : '';
  meta.textContent = `${session.messageCount || 0} msg • ${formatRelative(session.updatedAt)}${statusSuffix}`;

  item.append(head, meta);
  item.addEventListener('click', () => onSessionSelect(session.id));

  return item;
}

function getSessionItemKey(session) {
  const runtime = getSessionRuntimeStatus(session);
  const busy = isSessionBusy(state.activeProjectId, session.id);
  const active = session.id === state.activeSessionId;
  const statusSuffix = runtime && runtime.label ? runtime.label : '';
  return `${session.id}|${session.title || ''}|${session.messageCount || 0}|${session.updatedAt || ''}|${active}|${busy}|${statusSuffix}`;
}

function renderSessionList() {
  const sessions = state.sessions;
  const existingItems = els.sessionList.querySelectorAll('[data-session-id]');

  // If session count or order changed, do full rebuild
  const needsRebuild =
    existingItems.length !== sessions.length ||
    [...existingItems].some((el, i) => el.dataset.sessionId !== sessions[i].id);

  if (needsRebuild) {
    const frag = document.createDocumentFragment();
    sessions.forEach((session, index) => {
      frag.appendChild(renderSessionItem(session, index));
    });
    els.sessionList.innerHTML = '';
    els.sessionList.appendChild(frag);
    return;
  }

  // Patch in-place: update only what changed per item
  existingItems.forEach((item, index) => {
    const session = sessions[index];
    const runtime = getSessionRuntimeStatus(session);
    const busy = isSessionBusy(state.activeProjectId, session.id);
    const active = session.id === state.activeSessionId;

    item.classList.toggle('active', active);

    const runtimeDot = item.querySelector('.session-runtime');
    if (runtimeDot) {
      runtimeDot.className = `session-runtime${runtime && runtime.tone ? ` ${runtime.tone}` : ''}`;
      runtimeDot.title = runtime && runtime.label ? runtime.label : 'Idle';
    }

    const titleEl = item.querySelector('.session-title');
    if (titleEl) {
      titleEl.textContent = getSessionDisplayTitle(session);
    }

    const deleteBtn = item.querySelector('.session-delete');
    if (deleteBtn) {
      deleteBtn.disabled = state.busy || busy;
    }

    const meta = item.querySelector('.small');
    if (meta) {
      const statusSuffix = runtime && runtime.label ? ` • ${runtime.label}` : '';
      meta.textContent = `${session.messageCount || 0} msg • ${formatRelative(session.updatedAt)}${statusSuffix}`;
    }
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
    els.promptInput.placeholder = 'Tulis prompt...';
    return;
  }

  els.promptInput.placeholder = 'Pilih session dulu...';
}

let renderScheduled = false;
let renderNeedsFull = false;

function renderMessages(options = {}) {
  if (options && options.force) {
    renderNeedsFull = true;
  }

  if (renderScheduled) {
    return;
  }

  renderScheduled = true;
  const schedule = typeof window !== 'undefined' && window.requestAnimationFrame
    ? window.requestAnimationFrame
    : (cb) => setTimeout(cb, 16);

  schedule(() => {
    renderScheduled = false;
    const force = renderNeedsFull;
    renderNeedsFull = false;
    renderMessagesNow(force);
  });
}

function renderMessagesNow(force = false) {
  const session = state.activeSession;
  const messages = session && Array.isArray(session.messages) ? session.messages : [];
  const hasMessages = messages.length > 0;
  const hasWarning = !!state.chatWarning;
  const hasProcess = state.process.active || state.process.isError || isActiveAwaiting();
  const hasProcessForActiveSession =
    state.process.projectId === state.activeProjectId &&
    state.process.sessionId === state.activeSessionId &&
    hasProcess;
  const shouldShowEmpty = !hasMessages && !hasWarning && !hasProcessForActiveSession;
  const shouldStickToBottom = isNearBottom(els.chatLog) || isActiveAwaiting();
  const sessionId = session && session.id ? session.id : '';
  const domState = sessionId ? mountSessionDomState(sessionId) : null;
  const renderCache = domState ? domState.renderCache : createRenderCacheState();

  if (shouldShowEmpty) {
    if (domState) {
      domState.scrollTop = els.chatLog.scrollTop;
    }
    if (!renderCache.empty || els.emptyState.parentNode !== els.chatLog) {
      els.chatLog.innerHTML = '';
      els.chatLog.appendChild(els.emptyState);
    }

    renderCache.empty = true;
    renderCache.initialized = true;
    renderCache.sessionId = sessionId;
    renderCache.totalMessageCount = 0;
    renderCache.visibleStart = 0;
    renderCache.visibleEnd = 0;
    renderCache.lastVisibleMessageKey = '';
    renderCache.lastSessionUpdatedAt = session && session.updatedAt ? session.updatedAt : '';
    renderCache.warningKey = '';
    renderCache.assistantFlashId = state.assistantFlashMessageId;
    return;
  }

  if (els.emptyState.parentNode === els.chatLog) {
    els.chatLog.removeChild(els.emptyState);
  }

  if (!domState) {
    return;
  }

  if (renderCache.empty || domState.root.parentNode !== els.chatLog) {
    mountSessionDomState(sessionId);
    renderCache.empty = false;
  }

  const messageCount = messages.length;
  const sessionUpdatedAt = session && session.updatedAt ? session.updatedAt : '';
  const { start: visibleStart, end: visibleEnd } = ensureVisibleWindow(
    domState,
    messageCount,
    shouldStickToBottom,
    force,
  );
  const visibleMessages = messages.slice(visibleStart, visibleEnd);
  const lastVisibleIndex = visibleEnd - 1;
  const nextLastVisibleKey =
    visibleMessages.length > 0
      ? getMessageKey(messages[lastVisibleIndex], lastVisibleIndex)
      : '';
  const warningKey = getWarningKey(state.chatWarning);

  let needsFull =
    force ||
    !renderCache.initialized ||
    renderCache.sessionId !== sessionId ||
    renderCache.totalMessageCount !== messageCount ||
    renderCache.visibleStart !== visibleStart ||
    renderCache.visibleEnd !== visibleEnd ||
    renderCache.lastVisibleMessageKey !== nextLastVisibleKey ||
    renderCache.lastSessionUpdatedAt !== sessionUpdatedAt ||
    renderCache.warningKey !== warningKey ||
    renderCache.assistantFlashId !== state.assistantFlashMessageId;

  // Optimization: avoid full DOM rebuild for incremental changes
  if (needsFull && !force && renderCache.initialized && renderCache.sessionId === sessionId) {
    const sameWindow =
      renderCache.visibleStart === visibleStart &&
      renderCache.visibleEnd === visibleEnd &&
      renderCache.lastSessionUpdatedAt === sessionUpdatedAt &&
      renderCache.warningKey === warningKey;

    // Case 1: only flash class toggled — no DOM rebuild needed
    if (
      sameWindow &&
      renderCache.totalMessageCount === messageCount &&
      renderCache.lastVisibleMessageKey === nextLastVisibleKey &&
      renderCache.assistantFlashId !== state.assistantFlashMessageId
    ) {
      const prevFlashId = renderCache.assistantFlashId;
      if (prevFlashId) {
        const prevNode = domState.messageList.querySelector(`[data-message-id="${escapeSelector(prevFlashId)}"]`);
        if (prevNode) prevNode.classList.remove('assistant-arrived');
      }
      const nextFlashId = state.assistantFlashMessageId;
      if (nextFlashId) {
        const nextNode = domState.messageList.querySelector(`[data-message-id="${escapeSelector(nextFlashId)}"]`);
        if (nextNode) nextNode.classList.add('assistant-arrived');
      }
      renderCache.assistantFlashId = state.assistantFlashMessageId;
      needsFull = false;
    }

    // Case 2: only last message content changed (streaming update) — replace last node only
    if (
      needsFull &&
      sameWindow &&
      renderCache.totalMessageCount === messageCount &&
      renderCache.lastVisibleMessageKey !== nextLastVisibleKey &&
      renderCache.assistantFlashId === state.assistantFlashMessageId &&
      visibleMessages.length > 0 &&
      domState.messageList.childElementCount === visibleMessages.length
    ) {
      const lastMessage = visibleMessages[visibleMessages.length - 1];
      const isLatestAssistant =
        lastMessage.role === 'assistant' && lastVisibleIndex === visibleEnd - 1 && !isActiveAwaiting();
      const shouldFlash =
        lastMessage.role === 'assistant' &&
        lastMessage.id &&
        lastMessage.id === state.assistantFlashMessageId;
      let newNode = null;
      if (lastMessage.role === 'assistant') {
        newNode = buildAssistantMessage({
          message: lastMessage,
          isLatestAssistant,
          shouldFlash,
          animationDelay: '0ms',
          formatRelative,
          setStatus,
        });
      } else {
        newNode = buildUserMessage({
          message: lastMessage,
          shouldFlash,
          animationDelay: '0ms',
          formatRelative,
        });
      }
      if (newNode && domState.messageList.lastChild) {
        domState.messageList.replaceChild(newNode, domState.messageList.lastChild);
        renderCache.lastVisibleMessageKey = nextLastVisibleKey;
        needsFull = false;
      }
    }
  }

  if (needsFull) {
    const fragment = document.createDocumentFragment();

    visibleMessages.forEach((message, offset) => {
      const index = visibleStart + offset;
      const isLatestAssistant =
        message.role === 'assistant' && index === lastVisibleIndex && !isActiveAwaiting();
      const shouldFlash = message.role === 'assistant' && message.id && message.id === state.assistantFlashMessageId;
      const animationDelay = `${Math.min(offset * 32, 160)}ms`;

      if (message.role === 'assistant') {
        const assistantMessage = buildAssistantMessage({
          message,
          isLatestAssistant,
          shouldFlash,
          animationDelay,
          formatRelative,
          setStatus,
        });
        if (assistantMessage) {
          fragment.appendChild(assistantMessage);
        }
        return;
      }

      fragment.appendChild(
        buildUserMessage({
          message,
          shouldFlash,
          animationDelay,
          formatRelative,
        }),
      );
    });

    domState.messageList.innerHTML = '';
    domState.footer.innerHTML = '';
    domState.messageList.appendChild(fragment);
  }

  if (needsFull && hasWarning) {
    domState.footer.appendChild(buildWarningNode(state.chatWarning));
  }
  renderCache.empty = false;
  renderCache.warningKey = warningKey;

  renderCache.initialized = true;
  renderCache.sessionId = sessionId;
  renderCache.totalMessageCount = messageCount;
  renderCache.visibleStart = visibleStart;
  renderCache.visibleEnd = visibleEnd;
  renderCache.lastVisibleMessageKey = nextLastVisibleKey;
  renderCache.lastSessionUpdatedAt = sessionUpdatedAt;
  renderCache.assistantFlashId = state.assistantFlashMessageId;

  if (!isActiveAwaiting()) {
    const currentLive = domState.messageList.querySelectorAll('.message.assistant-flat.assistant-live');
    currentLive.forEach((node) => node.classList.remove('assistant-live'));
    const lastAssistant = [...visibleMessages].reverse().find((message) => message.role === 'assistant');
    if (lastAssistant) {
      const selector = lastAssistant.id
        ? `[data-message-id="${escapeSelector(lastAssistant.id)}"]`
        : null;
      const target = selector ? domState.messageList.querySelector(selector) : null;
      if (target) {
        target.classList.add('assistant-live');
      }
    }
  }

  renderJobsIndicator();
  if (restorePrependScroll(domState)) {
    domState.loadingOlder = false;
  } else if (shouldStickToBottom) {
    scrollChatToBottom();
  }

  if (els.processInline && renderProcessInlinePanel && getThinkingSnapshot) {
    if (!hasProcessForActiveSession) {
      els.processInline.hidden = true;
      els.processInline.innerHTML = '';
    } else {
      els.processInline.hidden = false;
      els.processInline.innerHTML = renderProcessInlinePanel(getThinkingSnapshot());
    }
  }

  domState.scrollTop = els.chatLog.scrollTop;
  domState.loadingOlder = false;
}

let processUI = null;
let getThinkingSnapshot = null;
let renderProcessInlinePanel = null;

processUI = createProcessUI({
  chatLog: els.chatLog,
  toggleRoot: els.processInline || els.chatLog,
  processState: state.process,
  renderMessages,
  labels: PROCESS_LABELS,
});

getThinkingSnapshot = processUI.getSnapshot;
renderProcessInlinePanel = processUI.renderProcessInlinePanel;

function setProcessStep(label) {
  state.process.label = label;
  if (state.process.startedAt > 0) {
    state.process.elapsedMs = Date.now() - state.process.startedAt;
  }
  if (!state.process.projectId) {
    state.process.projectId = state.activeProjectId || '';
  }
  if (!state.process.sessionId) {
    state.process.sessionId = state.activeSessionId || '';
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
  state.process.projectId = state.activeProjectId || '';
  state.process.sessionId = state.activeSessionId || '';
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
  state.process.projectId = '';
  state.process.sessionId = '';
  renderMessages();
}

function syncProcessFromJobs() {
  const projectId = state.activeProjectId;
  const sessionId = state.activeSessionId;
  if (!projectId || !sessionId) {
    return;
  }

  const job = getSessionJob(projectId, sessionId);
  if (job) {
    state.awaitingAssistant = true;
    if (
      !state.process.active ||
      state.process.projectId !== projectId ||
      state.process.sessionId !== sessionId
    ) {
      state.process.active = true;
      state.process.label = PROCESS_LABELS.waiting;
      state.process.startedAt = job.startedAt ? new Date(job.startedAt).getTime() : Date.now();
      state.process.elapsedMs = Date.now() - state.process.startedAt;
      state.process.isError = false;
      state.process.visible = false;
      state.process.exiting = false;
      state.process.events = [];
      state.process.showAll = false;
      state.process.projectId = projectId;
      state.process.sessionId = sessionId;
    }
  } else if (!localAwaitingBySession.has(getQueueKey(projectId, sessionId))) {
    state.awaitingAssistant = false;
    if (
      state.process.active &&
      state.process.projectId === projectId &&
      state.process.sessionId === sessionId
    ) {
      stopProcess();
    }
  }
  updateSendButtonState();
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
    await loadSessions(state.activeProjectId, { autoSelect: true, useStored: true });
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
  const validSessionIds = new Set(state.sessions.map((session) => session.id));
  for (const key of [...sessionDomCache.keys()]) {
    if (!validSessionIds.has(key) && key !== state.activeSessionId) {
      sessionDomCache.delete(key);
    }
  }

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
    syncActiveQueueSize();
    renderHeader();
    renderMessages();
  }
}

async function onSessionSelect(sessionId, shouldRenderList = true, options = {}) {
  const { preferCached = true } = options;

  if (hasOtherSessionActivity(state.activeProjectId, sessionId)) {
    setStatus('proses tetap berjalan di background', false, true);
  }

  state.activeSessionId = sessionId;
  localStorage.setItem(`activeSessionId:${state.activeProjectId}`, sessionId);
  state.assistantFlashMessageId = '';
  state.chatWarning = null;
  state.awaitingAssistant = isSessionAwaiting(state.activeProjectId, sessionId);
  state.requestAbortController =
    abortControllersBySession.get(getQueueKey(state.activeProjectId, sessionId)) || null;
  updateSendButtonState();
  mountSessionDomState(sessionId);

  if (!preferCached || !canReuseActiveSession(sessionId)) {
    const data = await api.getSession(state.activeProjectId, sessionId);
    state.activeSession = data.session;
  }
  applySessionPreferences(state.activeSession);
  syncActiveQueueSize();
  syncProcessFromJobs();

  if (shouldRenderList) {
    renderSessionList();
  }

  renderHeader();
  renderMessages();
  void drainPromptQueue(state.activeProjectId, sessionId);

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

  if (isSessionBusy(state.activeProjectId, sessionId)) {
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
    sessionDomCache.delete(sessionId);
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

async function undoLastTurn() {
  if (!state.activeProjectId || !state.activeSessionId) {
    setStatus('pilih session dulu', true);
    return;
  }

  if (isActiveAwaiting()) {
    setStatus('tunggu proses aktif selesai dulu', true);
    return;
  }

  if (state.busy) {
    return;
  }

  const hasMessages =
    state.activeSession &&
    Array.isArray(state.activeSession.messages) &&
    state.activeSession.messages.length > 0;
  if (!hasMessages) {
    setStatus('tidak ada pesan untuk di-undo', true);
    return;
  }

  setBusy(true);
  setStatus('undo pesan terakhir...', false, true);

  try {
    const data = await api.undoSession(state.activeProjectId, state.activeSessionId);
    if (data && data.session) {
      state.activeSession = data.session;
      sessionDomCache.delete(state.activeSessionId);
    }
    state.chatWarning = null;
    await loadSessions(state.activeProjectId);
    renderHeader();
    renderMessages({ force: true });
    setStatus('pesan terakhir di-undo');
  } catch (error) {
    setStatus(error.message || 'gagal undo pesan terakhir', true);
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
  const isViewingSession = state.activeProjectId === projectId && state.activeSessionId === sessionId;
  const promptKey =
    job.promptKey ||
    makePromptKey({
      projectId,
      sessionId,
      provider,
      model: job.model,
      reasoning: job.reasoning,
      mode: job.mode,
      prompt,
    });
  const queueKey = getQueueKey(projectId, sessionId);
  if (queueKey) {
    inflightPromptKeys.set(queueKey, promptKey);
  }

  setLocalAwaiting(projectId, sessionId, true);
  if (isViewingSession) {
    state.chatWarning = null;
    state.preferences = normalizePreferences({
      model: job.model,
      reasoning: job.reasoning,
      mode: job.mode,
    });
    state.process.hasEdits = false;
    updateSendButtonState();
    renderJobsIndicator();
    setStatus('neural pipeline active...', false, true);
    startProcess(PROCESS_LABELS.creating);
    refreshSessionRuntimeIndicators();
    addProcessEvent(`Sending prompt to ${provider}`);
  }

  try {
    const controller = new AbortController();
    setAbortController(projectId, sessionId, controller);

    if (isViewingSession && state.activeSession && state.activeSession.id === sessionId) {
      await autoTitleSessionFromPrompt(prompt);
    }
    if (controller.signal.aborted) {
      throw createAbortError();
    }
    if (isViewingSession) {
      setProcessStep(PROCESS_LABELS.sending);
    }
    const optimisticMessage = {
      id: `temp-${Date.now().toString(36)}`,
      role: 'user',
      provider,
      content: prompt,
      model: job.model,
      reasoning: job.reasoning,
      mode: job.mode,
      createdAt: new Date().toISOString(),
    };

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
    if (isViewingSession) {
      setProcessStep(PROCESS_LABELS.waiting);
    }
    void loadJobsIndicator();

    const data = await api.askInSession(
      projectId,
      sessionId,
      {
        prompt,
        provider,
        model: job.model,
        reasoning: job.reasoning,
        mode: job.mode,
      },
      { signal: controller.signal },
    );
    if (isViewingSession) {
      setProcessStep(PROCESS_LABELS.persisting);
    }
    const stillViewingSession = state.activeProjectId === projectId && state.activeSessionId === sessionId;
    if (stillViewingSession) {
      state.activeSession = data.session;
    }

    if (projectId === state.activeProjectId) {
      await loadSessions(projectId);
    }
    if (stillViewingSession) {
      stopProcess({ finalLabel: PROCESS_LABELS.done });
      refreshSessionRuntimeIndicators();
      addProcessEventsFromCliProgress(data.progress);
      addProcessEventsFromResult(data.result);
      addProcessEvent('Saved response');
      state.chatWarning = null;
    }
    if (typeof data.result !== 'string' || data.result.trim().length === 0) {
      if (stillViewingSession) {
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
    const aborted = isAbortError(error);

    if (projectId === state.activeProjectId && sessionId === state.activeSessionId) {
      try {
        await onSessionSelect(sessionId);
      } catch (_innerError) {
        // Keep current local state when refresh fails.
      }
    }

    if (aborted) {
      if (isViewingSession) {
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
      }
    } else {
      if (isViewingSession) {
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
    }
  } finally {
    const viewingNow = state.activeProjectId === projectId && state.activeSessionId === sessionId;
    if (queueKey && inflightPromptKeys.get(queueKey) === promptKey) {
      inflightPromptKeys.delete(queueKey);
    }
    setLocalAwaiting(projectId, sessionId, false);
    setAbortController(projectId, sessionId, null);
    if (viewingNow) {
      if (!state.process.isError) {
        stopProcess();
      }
      refreshSessionRuntimeIndicators();
    }
    void loadJobsIndicator();
    renderJobsIndicator();
    if (viewingNow) {
      renderHeader();
      renderMessages();
      updateSendButtonState();
    }
    void drainPromptQueue(projectId, sessionId);
  }
}

async function drainPromptQueue(projectId, sessionId) {
  const entry = getQueueState(projectId, sessionId);
  if (!entry) {
    if (state.activeProjectId === projectId && state.activeSessionId === sessionId) {
      syncActiveQueueSize();
    }
    return;
  }

  if (entry.state.draining || isSessionAwaiting(projectId, sessionId)) {
    return;
  }

  entry.state.draining = true;
  try {
    while (!isSessionAwaiting(projectId, sessionId) && entry.queue.size() > 0) {
      const job = entry.queue.dequeue();
      if (!job) {
        break;
      }
      await executePromptJob(job);
    }
  } finally {
    entry.state.draining = false;
    if (state.activeProjectId === projectId && state.activeSessionId === sessionId) {
      syncActiveQueueSize();
    }
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

  if (state.busy && !isActiveAwaiting()) {
    return;
  }

  let sessionId = '';
  try {
    sessionId = await ensureSessionForPrompt(prompt);
  } catch (error) {
    setStatus(error.message || 'create session in Settings first', true);
    return;
  }

  const promptKey = makePromptKey({
    projectId: state.activeProjectId,
    sessionId,
    provider,
    model,
    reasoning,
    mode,
    prompt,
  });
  const queueKey = getQueueKey(state.activeProjectId, sessionId);
  if (queueKey && inflightPromptKeys.get(queueKey) === promptKey) {
    setStatus('prompt sama sedang diproses', false, true);
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
    promptKey,
  };

  if (els.promptInput) {
    els.promptInput.value = '';
  }

  const entry = getQueueState(job.projectId, job.sessionId);
  if (entry) {
    const queued = entry.queue.list().some((item) => item && item.promptKey === promptKey);
    if (queued) {
      setStatus('prompt sama sudah ada di antrean', false, true);
      return;
    }
    entry.queue.enqueue(job);
  }
  if (isActiveAwaiting()) {
    setStatus(`prompt dimasukkan ke antrean (${state.queueSize})`, false, true);
    addProcessEvent(`Queued prompt (${state.queueSize})`);
  } else {
    setStatus('prompt ditambahkan ke antrean', false, true);
  }

  void drainPromptQueue(job.projectId, job.sessionId);
}

async function onProjectSelectChange() {
  if (isActiveAwaiting() || state.queueSize > 0) {
    els.projectSelect.value = state.activeProjectId;
    setStatus('selesaikan proses/antrean dulu sebelum pindah project', true);
    return;
  }

  state.activeProjectId = els.projectSelect.value;
  localStorage.setItem('activeProjectId', state.activeProjectId);
  state.chatWarning = null;
  syncActiveQueueSize();

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
  if (els.undoButton) {
    els.undoButton.addEventListener('click', undoLastTurn);
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
    els.promptInput.addEventListener('beforeinput', handlePromptBeforeInput);
    els.promptInput.addEventListener('focus', () => {
      composerInputFocused = true;
      if (composerCollapsed) {
        setComposerCollapsed(false);
        scrollChatToBottom();
      }
    });
    els.promptInput.addEventListener('blur', () => {
      composerInputFocused = false;
    });
  }
  if (els.askForm) {
    const composerBox = els.askForm.querySelector('.composer-box');
    if (composerBox) {
      composerBox.addEventListener('click', (e) => {
        if (composerCollapsed && !e.target.closest('button')) {
          els.promptInput?.focus();
        }
      });
    }
  }
  if (els.chatLog) {
    els.chatLog.addEventListener('scroll', handleChatScroll, { passive: true });
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
