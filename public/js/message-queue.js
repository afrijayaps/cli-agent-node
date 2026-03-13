function makeQueueId() {
  return `mq-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createMessageQueue({ onChange } = {}) {
  const items = [];

  function emitChange() {
    if (typeof onChange !== 'function') {
      return;
    }

    onChange({
      size: items.length,
      items: items.map((item) => ({ ...item })),
    });
  }

  function enqueue(payload) {
    const job = {
      id: makeQueueId(),
      queuedAt: new Date().toISOString(),
      ...(payload || {}),
    };
    items.push(job);
    emitChange();
    return job;
  }

  function dequeue() {
    if (items.length === 0) {
      return null;
    }
    const next = items.shift();
    emitChange();
    return next;
  }

  function size() {
    return items.length;
  }

  function clear() {
    if (items.length === 0) {
      return;
    }
    items.length = 0;
    emitChange();
  }

  return {
    enqueue,
    dequeue,
    size,
    clear,
  };
}
