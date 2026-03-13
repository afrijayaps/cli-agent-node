const { AppError } = require('./errors');
const { getDb } = require('./sqlite');
const { getProject, getSession } = require('./project-service');

const MEMORY_SCOPES = new Set(['project', 'session']);

function normalizeScope(scope) {
  const normalized = typeof scope === 'string' ? scope.trim().toLowerCase() : '';
  if (!MEMORY_SCOPES.has(normalized)) {
    throw new AppError(400, 'Validation error', 'scope must be one of: project, session.');
  }
  return normalized;
}

function normalizeContent(content) {
  return typeof content === 'string' ? content.trim() : '';
}

function makeMemoryId(projectId, scope, sessionId = '') {
  if (scope === 'project') {
    return `project::${projectId}`;
  }
  return `session::${projectId}::${sessionId}`;
}

function mapMemoryRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    projectId: row.project_id,
    sessionId: row.session_id || '',
    scope: row.scope,
    content: row.content || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function resolveTarget(projectId, scope, sessionId = '') {
  await getProject(projectId);

  if (scope === 'session') {
    if (typeof sessionId !== 'string' || sessionId.trim().length === 0) {
      throw new AppError(400, 'Validation error', 'sessionId is required for session scope.');
    }
    await getSession(projectId, sessionId.trim());
    return sessionId.trim();
  }

  return '';
}

async function getMemory(projectId, scope, sessionId = '') {
  const normalizedScope = normalizeScope(scope);
  const normalizedSessionId = await resolveTarget(projectId, normalizedScope, sessionId);
  const db = getDb();
  const row = db
    .prepare(
      `SELECT id, project_id, session_id, scope, content, created_at, updated_at
       FROM memories
       WHERE project_id = ? AND scope = ? AND COALESCE(session_id, '') = ?`,
    )
    .get(projectId, normalizedScope, normalizedSessionId);

  if (row) {
    return mapMemoryRow(row);
  }

  return {
    id: makeMemoryId(projectId, normalizedScope, normalizedSessionId),
    projectId,
    sessionId: normalizedSessionId,
    scope: normalizedScope,
    content: '',
    createdAt: '',
    updatedAt: '',
  };
}

async function setMemory(projectId, { scope, sessionId, content }) {
  const normalizedScope = normalizeScope(scope);
  const normalizedSessionId = await resolveTarget(projectId, normalizedScope, sessionId);
  const normalizedContent = normalizeContent(content);
  const now = new Date().toISOString();
  const db = getDb();
  const existing = db
    .prepare(
      `SELECT id, created_at
       FROM memories
       WHERE project_id = ? AND scope = ? AND COALESCE(session_id, '') = ?`,
    )
    .get(projectId, normalizedScope, normalizedSessionId);

  const id = existing ? existing.id : makeMemoryId(projectId, normalizedScope, normalizedSessionId);
  const createdAt = existing ? existing.created_at : now;

  db.prepare(
    `INSERT INTO memories (id, project_id, session_id, scope, content, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       content = excluded.content,
       updated_at = excluded.updated_at`,
  ).run(
    id,
    projectId,
    normalizedSessionId || null,
    normalizedScope,
    normalizedContent,
    createdAt,
    now,
  );

  return getMemory(projectId, normalizedScope, normalizedSessionId);
}

async function getMemoryContext(projectId, sessionId) {
  const [projectMemory, sessionMemory] = await Promise.all([
    getMemory(projectId, 'project'),
    sessionId ? getMemory(projectId, 'session', sessionId) : null,
  ]);

  return {
    project: projectMemory,
    session: sessionMemory,
  };
}

module.exports = {
  getMemory,
  setMemory,
  getMemoryContext,
};
