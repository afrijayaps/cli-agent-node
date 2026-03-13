const PARTS_CACHE_LIMIT = 200;
const MARKDOWN_HTML_CACHE_LIMIT = 300;
const MESSAGE_TEMPLATE_CACHE_LIMIT = 300;

const messagePartsCache = new Map();
const markdownHtmlCache = new Map();
const assistantTemplateCache = new Map();
const userTemplateCache = new Map();

function setBoundedCache(cache, key, value, limit) {
  if (cache.has(key)) {
    cache.delete(key);
  }
  cache.set(key, value);
  if (cache.size > limit) {
    const firstKey = cache.keys().next().value;
    cache.delete(firstKey);
  }
}

function cloneParts(parts) {
  return parts.map((part) => ({ ...part }));
}

function getMessageTemplateKey(message) {
  if (!message || typeof message !== 'object') {
    return '';
  }

  return [
    typeof message.id === 'string' ? message.id : '',
    typeof message.role === 'string' ? message.role : '',
    typeof message.provider === 'string' ? message.provider : '',
    typeof message.createdAt === 'string' ? message.createdAt : '',
    typeof message.content === 'string' ? message.content : '',
  ].join('|');
}

function applyMessagePresentation(box, { message, shouldFlash, animationDelay }) {
  if (!box) {
    return;
  }

  box.style.animationDelay = animationDelay;
  box.dataset.messageId = message && typeof message.id === 'string' ? message.id : '';
  box.dataset.role = message && typeof message.role === 'string' ? message.role : '';
  box.classList.toggle('assistant-arrived', Boolean(shouldFlash));
}

function bindCopyButtons(box, codeParts, setStatus) {
  if (!box || !Array.isArray(codeParts) || codeParts.length === 0) {
    return;
  }

  const copyButtons = box.querySelectorAll('.code-copy');
  copyButtons.forEach((button) => {
    const index = Number.parseInt(button.dataset.codeIndex || '', 10);
    const part = Number.isInteger(index) ? codeParts[index] : null;
    if (!part) {
      return;
    }

    button.addEventListener('click', async () => {
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
  });
}

function extractMessageParts(text) {
  if (typeof text !== 'string' || text.length === 0) {
    return [];
  }

  const cached = messagePartsCache.get(text);
  if (cached) {
    return cloneParts(cached);
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

  setBoundedCache(messagePartsCache, text, cloneParts(parts), PARTS_CACHE_LIMIT);
  return parts;
}

function renderInlineMarkdown(text) {
  const fragment = document.createDocumentFragment();
  const pathPattern =
    /(?:[A-Za-z]:\\(?:[^\\s]+\\)*[^\\s]+|\/(?:[\w.-]+\/)*[\w.-]+|\b(?:[\w-]+\/)+[\w.-]+)/g;

  const appendTextWithPaths = (value) => {
    let lastIndex = 0;
    let match;

    while ((match = pathPattern.exec(value)) !== null) {
      const matchValue = match[0];
      if (match.index > lastIndex) {
        fragment.appendChild(document.createTextNode(value.slice(lastIndex, match.index)));
      }
      if (/^https?:\/\//i.test(matchValue)) {
        fragment.appendChild(document.createTextNode(matchValue));
      } else {
        const pathSpan = document.createElement('span');
        pathSpan.className = 'ai-path';
        pathSpan.textContent = matchValue;
        fragment.appendChild(pathSpan);
      }
      lastIndex = match.index + matchValue.length;
    }

    if (lastIndex < value.length) {
      fragment.appendChild(document.createTextNode(value.slice(lastIndex)));
    }
  };

  const codeSplit = text.split(/`([^`]+)`/g);
  codeSplit.forEach((chunk, index) => {
    if (index % 2 === 1) {
      const code = document.createElement('code');
      code.textContent = chunk;
      fragment.appendChild(code);
      return;
    }

    const linkPattern = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
    let lastIndex = 0;
    let match;

    while ((match = linkPattern.exec(chunk)) !== null) {
      if (match.index > lastIndex) {
        appendTextWithPaths(chunk.slice(lastIndex, match.index));
      }

      const anchor = document.createElement('a');
      anchor.href = match[2];
      anchor.rel = 'noopener noreferrer';
      anchor.target = '_blank';
      anchor.textContent = match[1];
      fragment.appendChild(anchor);
      lastIndex = linkPattern.lastIndex;
    }

    const remainder = chunk.slice(lastIndex);
    if (remainder.length === 0) {
      return;
    }

    const emphasisSplit = remainder.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
    emphasisSplit.forEach((part) => {
      if (!part) {
        return;
      }
      if (part.startsWith('**') && part.endsWith('**')) {
        const strong = document.createElement('strong');
        strong.textContent = part.slice(2, -2);
        fragment.appendChild(strong);
        return;
      }
      if (part.startsWith('*') && part.endsWith('*')) {
        const em = document.createElement('em');
        em.textContent = part.slice(1, -1);
        fragment.appendChild(em);
        return;
      }
      appendTextWithPaths(part);
    });
  });

  return fragment;
}

function renderMarkdownBlocks(text) {
  const fragment = document.createDocumentFragment();
  if (typeof text !== 'string' || text.trim().length === 0) {
    return fragment;
  }

  const lines = text.replace(/\r\n/g, '\n').split('\n');
  let index = 0;

  const flushParagraph = (buffer) => {
    if (buffer.length === 0) {
      return;
    }
    const paragraph = document.createElement('p');
    paragraph.appendChild(renderInlineMarkdown(buffer.join(' ')));
    fragment.appendChild(paragraph);
    buffer.length = 0;
  };

  while (index < lines.length) {
    const raw = lines[index];
    const line = raw.trim();

    if (line.length === 0) {
      index += 1;
      continue;
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const heading = document.createElement(`h${level}`);
      heading.appendChild(renderInlineMarkdown(headingMatch[2]));
      fragment.appendChild(heading);
      index += 1;
      continue;
    }

    const labelMatch = line.match(/^(Title|Summary|Steps|Judul)\s*:\s*(.*)$/i);
    if (labelMatch) {
      const heading = document.createElement('h4');
      heading.appendChild(renderInlineMarkdown(labelMatch[1]));
      fragment.appendChild(heading);
      if (labelMatch[2]) {
        const paragraph = document.createElement('p');
        paragraph.appendChild(renderInlineMarkdown(labelMatch[2]));
        fragment.appendChild(paragraph);
      }
      index += 1;
      continue;
    }

    const unorderedMatch = line.match(/^[-*]\s+(.*)$/);
    const orderedMatch = line.match(/^\d+\.\s+(.*)$/);

    if (unorderedMatch) {
      const list = document.createElement('ul');
      while (index < lines.length) {
        const current = lines[index].trim();
        const matchItem = current.match(/^[-*]\s+(.*)$/);
        if (!matchItem) {
          break;
        }
        const item = document.createElement('li');
        item.appendChild(renderInlineMarkdown(matchItem[1]));
        list.appendChild(item);
        index += 1;
      }
      fragment.appendChild(list);
      continue;
    }

    if (orderedMatch) {
      const list = document.createElement('ol');
      while (index < lines.length) {
        const current = lines[index].trim();
        const matchItem = current.match(/^\d+\.\s+(.*)$/);
        if (!matchItem) {
          break;
        }
        const item = document.createElement('li');
        item.appendChild(renderInlineMarkdown(matchItem[1]));
        list.appendChild(item);
        index += 1;
      }
      fragment.appendChild(list);
      continue;
    }

    const buffer = [];
    while (index < lines.length) {
      const current = lines[index].trim();
      if (
        current.length === 0 ||
        /^#{1,3}\s+/.test(current) ||
        /^(Title|Summary|Steps|Judul)\s*:/i.test(current) ||
        /^[-*]\s+/.test(current) ||
        /^\d+\.\s+/.test(current)
      ) {
        break;
      }
      buffer.push(current);
      index += 1;
    }
    flushParagraph(buffer);
  }

  return fragment;
}

function getMarkdownHtml(text) {
  if (typeof text !== 'string' || text.trim().length === 0) {
    return '';
  }

  const cached = markdownHtmlCache.get(text);
  if (typeof cached === 'string') {
    return cached;
  }

  const container = document.createElement('div');
  container.appendChild(renderMarkdownBlocks(text));
  const html = container.innerHTML;
  setBoundedCache(markdownHtmlCache, text, html, MARKDOWN_HTML_CACHE_LIMIT);
  return html;
}

function createAssistantTemplate({ message, formatRelative }) {
  const parts = extractMessageParts(message.content);
  if (parts.length === 0) {
    return null;
  }

  const isSystemMessage =
    message && typeof message.provider === 'string' && message.provider.trim().toLowerCase() === 'system';
  const box = document.createElement('article');
  box.className = `message assistant-flat enter${isSystemMessage ? ' system-message' : ''}`;

  const meta = document.createElement('div');
  meta.className = 'message-meta';
  meta.textContent = isSystemMessage
    ? `System • ${formatRelative(message.createdAt)}`
    : `Assistant (${message.provider || 'cli'}) • ${formatRelative(message.createdAt)}`;
  box.appendChild(meta);

  let codeIndex = 0;
  const codeParts = [];
  parts.forEach((part) => {
    if (part.type === 'text') {
      const textNode = document.createElement('div');
      textNode.className = 'assistant-markdown';
      textNode.innerHTML = getMarkdownHtml(part.value);
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
    copyBtn.dataset.codeIndex = String(codeIndex);
    copyBtn.textContent = 'Copy';

    head.append(label, copyBtn);

    const pre = document.createElement('pre');
    pre.textContent = part.code;

    card.append(head, pre);
    box.appendChild(card);
    codeParts.push(part);
    codeIndex += 1;
  });

  return {
    template: box,
    codeParts: cloneParts(codeParts),
  };
}

function createUserTemplate({ message, formatRelative }) {
  const box = document.createElement('article');
  box.className = 'message enter user';

  const meta = document.createElement('div');
  meta.className = 'message-meta';
  meta.textContent = `You • ${formatRelative(message.createdAt)}`;

  const content = document.createElement('div');
  content.className = 'message-content';
  content.textContent = message.content;

  box.append(meta, content);
  return box;
}

export function buildAssistantMessage({
  message,
  isLatestAssistant,
  shouldFlash,
  animationDelay,
  formatRelative,
  setStatus,
}) {
  const cacheKey = getMessageTemplateKey(message);
  let cached = cacheKey ? assistantTemplateCache.get(cacheKey) : null;

  if (!cached) {
    cached = createAssistantTemplate({ message, formatRelative });
    if (!cached) {
      return null;
    }
    if (cacheKey) {
      setBoundedCache(assistantTemplateCache, cacheKey, cached, MESSAGE_TEMPLATE_CACHE_LIMIT);
    }
  }

  const box = cached.template.cloneNode(true);
  applyMessagePresentation(box, { message, shouldFlash, animationDelay });
  box.classList.toggle('assistant-live', Boolean(isLatestAssistant));
  bindCopyButtons(box, cached.codeParts, setStatus);
  if (!box.querySelector('.assistant-markdown, .code-card')) {
    return null;
  }

  return box;
}

export function buildUserMessage({ message, shouldFlash, animationDelay, formatRelative }) {
  const cacheKey = getMessageTemplateKey(message);
  let template = cacheKey ? userTemplateCache.get(cacheKey) : null;
  if (!template) {
    template = createUserTemplate({ message, formatRelative });
    if (cacheKey) {
      setBoundedCache(userTemplateCache, cacheKey, template, MESSAGE_TEMPLATE_CACHE_LIMIT);
    }
  }

  const box = template.cloneNode(true);
  applyMessagePresentation(box, { message, shouldFlash, animationDelay });
  return box;
}
