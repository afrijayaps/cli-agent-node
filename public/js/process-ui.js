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

function getPhasePercent(label, labels, active) {
  if (!label) {
    return active ? 35 : 100;
  }
  if (labels) {
    if (label === labels.creating) {
      return 20;
    }
    if (label === labels.sending) {
      return 38;
    }
    if (label === labels.waiting) {
      return 64;
    }
    if (label === labels.persisting) {
      return 84;
    }
    if (label === labels.done || label === labels.stopped) {
      return 100;
    }
  }
  return active ? 55 : 100;
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

export function createProcessUI({ chatLog, processState, renderMessages, labels }) {
  const state = processState || {};

  if (chatLog && !chatLog.__processToggleBound) {
    chatLog.__processToggleBound = true;
    chatLog.addEventListener('click', (event) => {
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
    const percent = Math.max(
      6,
      Math.min(100, getPhasePercent(snapshot.label, labels, snapshot.active)),
    );
    const shellClass = `thinking-shell${showAll ? '' : ' compact'}${
      snapshot.isError ? ' error' : ''
    }`;
    const processList = showAll ? renderProcessList(snapshot.events, snapshot.isError) : '';
    const elapsedLabel = formatDuration(snapshot.elapsedMs);
    const metaLabel = snapshot.hasEvents
      ? `${snapshot.events.length} aktivitas`
      : 'Belum ada detail';

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
        ${
          showAll
            ? `
          <div class="thinking-phase">${escapeHtml(snapshot.label || title)}</div>
          <div class="thinking-rail"><span style="width: ${percent}%"></span></div>
          ${processList}
          <div class="thinking-meta muted">${escapeHtml(elapsedLabel)} • ${escapeHtml(
              metaLabel,
            )}</div>
        `
            : ''
        }
      </section>
    `;
  }

  return {
    getSnapshot,
    renderThinkingPanel,
  };
}
