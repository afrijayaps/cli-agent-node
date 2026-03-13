const DEFAULT_TITLE = 'Memproses';

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) {
    return '0s';
  }
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (!minutes) {
    return `${seconds}s`;
  }
  return `${minutes}m ${seconds}s`;
}

function getProgressView(snapshot) {
  const percent = Number.isFinite(snapshot && snapshot.progressPercent)
    ? Math.max(0, Math.min(100, snapshot.progressPercent))
    : null;

  if (percent !== null) {
    return {
      determinate: true,
      width: Math.max(2, percent),
    };
  }

  return {
    determinate: !snapshot.active,
    width: snapshot.active ? 42 : 100,
  };
}

function renderProcessEvent(text) {
  if (!text) {
    return '';
  }
  const trimmed = text.trim();
  if (!trimmed) {
    return '';
  }

  let match = trimmed.match(/^(Read|Edited|Created|Updated|Deleted|Modified)\s+(.+)$/i);
  if (match) {
    return `
      <div class="process-event">
        <span class="process-dot"></span>
        <span class="process-text">${escapeHtml(match[1])}</span>
        <span class="process-file">${escapeHtml(match[2])}</span>
      </div>
    `;
  }

  match = trimmed.match(/^Explored\s+(\d+)\s+files?(?:,\s*(\d+)\s+search(?:es)?)?/i);
  if (match) {
    const fileCount = match[1];
    const searchCount = match[2];
    return `
      <div class="process-event">
        <span class="process-dot"></span>
        <span class="process-text">Explored</span>
        <span class="process-count">${escapeHtml(fileCount)}</span>
        <span class="process-text">files</span>
        ${
          searchCount
            ? `<span class="process-text">,</span><span class="process-count">${escapeHtml(
                searchCount,
              )}</span><span class="process-text">search</span>`
            : ''
        }
      </div>
    `;
  }

  match = trimmed.match(/^Searched\s+for\s+(.+)/i);
  if (match) {
    return `
      <div class="process-event">
        <span class="process-dot"></span>
        <span class="process-text">Searched</span>
        <span class="process-file">${escapeHtml(match[1])}</span>
      </div>
    `;
  }

  match = trimmed.match(/^CLI:\s*(.+)/i);
  if (match) {
    return `
      <div class="process-event">
        <span class="process-dot"></span>
        <span class="process-text">CLI:</span>
        <span class="process-file">${escapeHtml(match[1])}</span>
      </div>
    `;
  }

  return `
    <div class="process-event">
      <span class="process-dot"></span>
      <span class="process-text">${escapeHtml(trimmed)}</span>
    </div>
  `;
}

function renderProcessList(events, isError) {
  if (!Array.isArray(events) || events.length === 0) {
    return '';
  }
  const items = events.map(renderProcessEvent).filter(Boolean).join('');
  const className = `process-list${isError ? ' error' : ''}`;
  return `<div class="${className}">${items}</div>`;
}

export function createProcessUI({ chatLog, toggleRoot, processState, renderMessages }) {
  const state = processState || {};
  const bindRoot = toggleRoot || chatLog;

  if (bindRoot && !bindRoot.__processToggleBound) {
    bindRoot.__processToggleBound = true;
    bindRoot.addEventListener('click', (event) => {
      const toggle = event.target.closest('[data-process-toggle]');
      if (!toggle) {
        return;
      }
      event.preventDefault();
      state.showAll = !state.showAll;
      if (typeof renderMessages === 'function') {
        renderMessages();
      }
    });
  }

  function getSnapshot() {
    const events = Array.isArray(state.events) ? [...state.events] : [];
    const elapsedMs =
      Number.isFinite(state.elapsedMs) && state.elapsedMs > 0
        ? state.elapsedMs
        : Number.isFinite(state.startedAt) && state.startedAt > 0
          ? Date.now() - state.startedAt
          : 0;
    return {
      active: Boolean(state.active),
      isError: Boolean(state.isError),
      label: typeof state.label === 'string' ? state.label : '',
      startedAt: Number.isFinite(state.startedAt) ? state.startedAt : 0,
      elapsedMs,
      progressPercent: Number.isFinite(state.progressPercent) ? state.progressPercent : null,
      events,
      showAll: Boolean(state.showAll),
      hasEvents: events.length > 0,
    };
  }

  function renderThinkingPanel(snapshot) {
    if (!snapshot) {
      return '';
    }
    const showAll = snapshot.showAll && snapshot.hasEvents;
    const title = DEFAULT_TITLE;
    const toggleLabel = showAll ? '▲' : '▼';
    const toggleText = showAll ? 'Sembunyikan detail' : 'Lihat detail';
    const progressView = getProgressView(snapshot);
    const shellClass = `thinking-shell${showAll ? '' : ' compact'}${
      snapshot.isError ? ' error' : ''
    }`;
    const processList = showAll ? renderProcessList(snapshot.events, snapshot.isError) : '';
    const elapsedLabel = formatDuration(snapshot.elapsedMs);
    const metaLabel = snapshot.hasEvents
      ? `${snapshot.events.length} aktivitas`
      : 'Belum ada detail';
    const phaseLabel = snapshot.label || title;
    const phaseClass = `thinking-phase${showAll ? '' : ' compact'}`;

    return `
      <section class="${shellClass}">
        <div class="thinking-title-row">
          <div class="thinking-title">
            <span class="signal-ring"></span>
            ${escapeHtml(title)}
          </div>
          <button class="process-toggle inline" data-process-toggle type="button" aria-label="${escapeHtml(
            toggleText,
          )}" aria-expanded="${showAll ? 'true' : 'false'}">${toggleLabel}</button>
        </div>
        <div class="${phaseClass}">${escapeHtml(phaseLabel)}</div>
        <div class="thinking-rail${progressView.determinate ? '' : ' indeterminate'}"><span style="width: ${progressView.width}%"></span></div>
        ${showAll ? processList : ''}
        <div class="thinking-meta muted">${escapeHtml(elapsedLabel)} • ${escapeHtml(metaLabel)}</div>
      </section>
    `;
  }

  function renderProcessInlinePanel(snapshot) {
    if (!snapshot) {
      return '';
    }

    const showAll = snapshot.showAll && snapshot.hasEvents;
    const title = DEFAULT_TITLE;
    const toggleLabel = showAll ? '▲' : '▼';
    const toggleText = showAll ? 'Sembunyikan detail' : 'Lihat detail';
    const progressView = getProgressView(snapshot);
    const phaseLabel = snapshot.label || title;
    const elapsedLabel = formatDuration(snapshot.elapsedMs);
    const metaLabel = snapshot.hasEvents
      ? `${snapshot.events.length} aktivitas`
      : 'Belum ada detail';
    const processList = showAll ? renderProcessList(snapshot.events, snapshot.isError) : '';
    const shellClass = `process-inline${showAll ? ' open' : ''}${
      snapshot.isError ? ' error' : ''
    }`;

    return `
      <div class="${shellClass}">
        <div class="process-inline-row">
          <div class="process-inline-title">
            <span class="signal-ring"></span>
            <span>${escapeHtml(title)}</span>
          </div>
          <div class="process-inline-phase" title="${escapeHtml(phaseLabel)}">${escapeHtml(phaseLabel)}</div>
          <div class="process-inline-rail${progressView.determinate ? '' : ' indeterminate'}"><span style="width: ${progressView.width}%"></span></div>
          <div class="process-inline-meta">${escapeHtml(elapsedLabel)} • ${escapeHtml(metaLabel)}</div>
          <button class="process-toggle inline process-inline-toggle" data-process-toggle type="button" aria-label="${escapeHtml(
            toggleText,
          )}" aria-expanded="${showAll ? 'true' : 'false'}">${toggleLabel}</button>
        </div>
        ${showAll ? `<div class="process-inline-detail">${processList}</div>` : ''}
      </div>
    `;
  }

  return {
    getSnapshot,
    renderThinkingPanel,
    renderProcessInlinePanel,
  };
}
