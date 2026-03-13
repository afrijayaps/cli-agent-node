function makeJobId() {
  const stamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `job-${stamp}-${random}`;
}

const jobs = new Map();

function startJob(meta = {}) {
  const id = makeJobId();
  const now = new Date().toISOString();
  const { cancel, ...safeMeta } = meta || {};
  const payload = {
    id,
    startedAt: now,
    ...safeMeta,
  };
  jobs.set(id, {
    meta: payload,
    cancel: typeof cancel === 'function' ? cancel : null,
  });
  return id;
}

function endJob(id) {
  if (!id) {
    return;
  }
  jobs.delete(id);
}

function updateJob(id, patch = {}) {
  if (!id || !patch || typeof patch !== 'object') {
    return;
  }
  const entry = jobs.get(id);
  if (!entry || !entry.meta) {
    return;
  }
  entry.meta = {
    ...entry.meta,
    ...patch,
  };
}

function listJobs() {
  return Array.from(jobs.values())
    .map((entry) => (entry && entry.meta ? entry.meta : {}))
    .sort((a, b) => {
      const aTime = a && a.startedAt ? new Date(a.startedAt).getTime() : 0;
      const bTime = b && b.startedAt ? new Date(b.startedAt).getTime() : 0;
      return bTime - aTime;
    });
}

function stopAllJobs(reason = 'Request aborted by stop-all jobs.') {
  const entries = Array.from(jobs.values());
  let stopped = 0;

  for (const entry of entries) {
    if (!entry || typeof entry.cancel !== 'function') {
      continue;
    }

    try {
      entry.cancel(reason);
      stopped += 1;
    } catch (_error) {
      // Best-effort cancellation.
    }
  }

  jobs.clear();
  return {
    stopped,
    total: entries.length,
  };
}

function countJobs() {
  return jobs.size;
}

module.exports = {
  startJob,
  endJob,
  updateJob,
  listJobs,
  stopAllJobs,
  countJobs,
};
