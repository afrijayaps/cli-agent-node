const { AppError } = require('./errors');
const { PROJECTS_DIR, ensureDir, fileExists, readJson, writeJson, fs, path } = require('./storage');
const { getDb } = require('./sqlite');

const PROJECT_FILE = 'project.json';
const SESSIONS_DIR = 'sessions';
const DEFAULT_SESSION_PREFERENCES = {
  model: '',
  reasoning: 'medium',
  mode: 'normal',
};

function normalizeSessionPreferences(input) {
  const preferences = { ...DEFAULT_SESSION_PREFERENCES };

  if (input && typeof input.model === 'string') {
    preferences.model = input.model.trim();
  }

  if (input && typeof input.reasoning === 'string') {
    const reasoning = input.reasoning.trim();
    if (reasoning === 'standard') {
      preferences.reasoning = 'medium';
    } else if (reasoning === 'deep') {
      preferences.reasoning = 'high';
    } else if (['low', 'medium', 'high', 'xhigh'].includes(reasoning)) {
      preferences.reasoning = reasoning;
    }
  }

  if (input && typeof input.mode === 'string') {
    const mode = input.mode.trim();
    if (mode === 'plan' || mode === 'normal') {
      preferences.mode = mode;
    }
  }

  return preferences;
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'project';
}

function slugifyProjectPath(value) {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/^[a-z]:/i, '')
    .replace(/[\\/]+/g, '-')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70) || 'root';
}

function isSafeProjectId(value) {
  return typeof value === 'string' && /^[a-z0-9-]+(--[a-z0-9-]+)?$/i.test(value);
}

function isSafeSessionId(value) {
  if (typeof value !== 'string') {
    return false;
  }

  return /^[a-z0-9._-]+::[a-z0-9]{6}$/i.test(value);
}

function makeId(prefix) {
  const stamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${stamp}-${random}`;
}

function normalizeFolderToken(value) {
  return String(value || '')
    .trim()
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'project';
}

function makeSessionId(projectName) {
  const folderToken = normalizeFolderToken(projectName);
  let token = '';
  while (token.length < 6) {
    token += Math.random().toString(36).slice(2);
  }
  token = token.slice(0, 6);
  return `${folderToken}::${token}`;
}

function getProjectFolderName(project) {
  if (!project || typeof project !== 'object') {
    return '';
  }

  if (typeof project.projectPath === 'string' && project.projectPath.trim().length > 0) {
    return path.basename(project.projectPath.trim());
  }

  return typeof project.name === 'string' ? project.name : '';
}

function resolveProjectNameFromPath(projectPath, fallbackName = '') {
  if (typeof projectPath === 'string' && projectPath.trim().length > 0) {
    const base = path.basename(projectPath.trim());
    if (base) {
      return base;
    }
  }
  return typeof fallbackName === 'string' ? fallbackName : '';
}

function makeProjectId(name, projectPath) {
  const nameSlug = slugify(name);
  const pathSlug = slugifyProjectPath(projectPath);
  return `${nameSlug}--${pathSlug}`;
}

function isPathInsideRoot(candidatePath, rootPath) {
  const absCandidate = path.resolve(candidatePath);
  const absRoot = path.resolve(rootPath);
  const relative = path.relative(absRoot, absCandidate);

  if (!relative) {
    return true;
  }

  return !relative.startsWith('..') && !path.isAbsolute(relative);
}

async function directoryExists(dirPath) {
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch (_error) {
    return false;
  }
}

function getProjectDir(projectId) {
  if (!isSafeProjectId(projectId)) {
    throw new AppError(400, 'Validation error', 'Invalid project id.');
  }

  if (!projectId.includes('--')) {
    return path.join(PROJECTS_DIR, projectId);
  }

  const [nameSlug, ...rest] = projectId.split('--');
  const pathSlug = rest.join('--');

  if (!nameSlug || !pathSlug) {
    throw new AppError(400, 'Validation error', 'Invalid project id.');
  }

  return path.join(PROJECTS_DIR, nameSlug, pathSlug);
}

function getProjectFile(projectId) {
  return path.join(getProjectDir(projectId), PROJECT_FILE);
}

function getSessionsDir(projectId) {
  return path.join(getProjectDir(projectId), SESSIONS_DIR);
}

function getSessionFile(projectId, sessionId) {
  if (!isSafeSessionId(sessionId)) {
    throw new AppError(400, 'Validation error', 'Invalid session id.');
  }

  return path.join(getSessionsDir(projectId), `${sessionId}.json`);
}

function mapProjectRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    projectPath: row.project_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSessionRow(row) {
  if (!row) {
    return null;
  }

  let preferences = { ...DEFAULT_SESSION_PREFERENCES };
  let messages = [];

  try {
    preferences = normalizeSessionPreferences(JSON.parse(row.preferences_json || '{}'));
  } catch (_error) {
    preferences = { ...DEFAULT_SESSION_PREFERENCES };
  }

  try {
    const parsed = JSON.parse(row.messages_json || '[]');
    messages = Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    messages = [];
  }

  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    preferences,
    messages,
  };
}

function upsertProjectDb(project) {
  const db = getDb();
  db.prepare(
    `INSERT INTO projects (id, name, project_path, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       project_path = excluded.project_path,
       created_at = excluded.created_at,
       updated_at = excluded.updated_at`,
  ).run(project.id, project.name, project.projectPath, project.createdAt, project.updatedAt);
}

function upsertSessionDb(session) {
  const db = getDb();
  db.prepare(
    `INSERT INTO sessions (
      id, project_id, title, created_at, updated_at, preferences_json, messages_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      project_id = excluded.project_id,
      title = excluded.title,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at,
      preferences_json = excluded.preferences_json,
      messages_json = excluded.messages_json`,
  ).run(
    session.id,
    session.projectId,
    session.title || '',
    session.createdAt,
    session.updatedAt,
    JSON.stringify(normalizeSessionPreferences(session.preferences)),
    JSON.stringify(Array.isArray(session.messages) ? session.messages : []),
  );
}

async function migrateLegacyProjectIfNeeded(projectId) {
  const db = getDb();
  const existing = db.prepare(`SELECT id, name, project_path, created_at, updated_at FROM projects WHERE id = ?`).get(projectId);
  if (existing) {
    return mapProjectRow(existing);
  }

  const projectFile = getProjectFile(projectId);
  const project = await readJson(projectFile, null);
  if (!project) {
    return null;
  }

  const synced = await ensureProjectNameSynced(project, projectFile);
  upsertProjectDb(synced);

  const sessionsDir = getSessionsDir(projectId);
  if (await directoryExists(sessionsDir)) {
    const files = await fs.readdir(sessionsDir, { withFileTypes: true });
    for (const file of files) {
      if (!file.isFile() || !file.name.endsWith('.json')) {
        continue;
      }

      const session = await readJson(path.join(sessionsDir, file.name), null);
      if (session && isSafeSessionId(session.id)) {
        upsertSessionDb({
          ...session,
          projectId,
          preferences: normalizeSessionPreferences(session.preferences),
          messages: Array.isArray(session.messages) ? session.messages : [],
        });
      }
    }
  }

  return synced;
}

async function ensureProjectNameSynced(project, projectFile) {
  if (!project || typeof project !== 'object') {
    return project;
  }

  const desiredName = resolveProjectNameFromPath(project.projectPath, project.name);
  if (!desiredName || project.name === desiredName) {
    return project;
  }

  const updated = { ...project, name: desiredName };
  if (projectFile) {
    await writeJson(projectFile, updated);
  }
  upsertProjectDb(updated);
  return updated;
}

async function getProjectOrThrow(projectId) {
  const db = getDb();
  let project = mapProjectRow(
    db.prepare(`SELECT id, name, project_path, created_at, updated_at FROM projects WHERE id = ?`).get(projectId),
  );

  if (!project) {
    project = await migrateLegacyProjectIfNeeded(projectId);
  }

  if (!project) {
    throw new AppError(404, 'Not found', 'Project not found.');
  }

  return ensureProjectNameSynced(project, getProjectFile(projectId));
}

async function listProjects(options = {}) {
  const masterProjectRoot =
    options && typeof options.masterProjectRoot === 'string' ? path.resolve(options.masterProjectRoot) : null;

  await ensureDir(PROJECTS_DIR);

  const db = getDb();
  const rows = db
    .prepare(`SELECT id, name, project_path, created_at, updated_at FROM projects ORDER BY updated_at DESC`)
    .all();

  let projects = rows.map(mapProjectRow);

  if (projects.length === 0) {
    const levelOne = await fs.readdir(PROJECTS_DIR, { withFileTypes: true });
    for (const nameDir of levelOne.filter((entry) => entry.isDirectory())) {
      const namePath = path.join(PROJECTS_DIR, nameDir.name);
      const legacyProjectFile = path.join(namePath, PROJECT_FILE);
      const legacyProject = await readJson(legacyProjectFile, null);

      if (legacyProject) {
        const synced = await ensureProjectNameSynced(legacyProject, legacyProjectFile);
        upsertProjectDb(synced);
        projects.push(synced);
        continue;
      }

      const levelTwo = await fs.readdir(namePath, { withFileTypes: true });
      for (const pathDir of levelTwo.filter((entry) => entry.isDirectory())) {
        const projectFile = path.join(namePath, pathDir.name, PROJECT_FILE);
        const project = await readJson(projectFile, null);
        if (project) {
          const synced = await ensureProjectNameSynced(project, projectFile);
          upsertProjectDb(synced);
          projects.push(synced);
        }
      }
    }
  }

  projects.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  if (!masterProjectRoot) {
    return projects;
  }

  const validProjects = projects.filter(
    (project) =>
      typeof project.projectPath === 'string' && isPathInsideRoot(project.projectPath, masterProjectRoot),
  );

  const existChecks = await Promise.all(validProjects.map((project) => directoryExists(project.projectPath)));
  return validProjects.filter((_, index) => existChecks[index]);
}

async function upsertProjectRecord({ name, projectPath, failIfExists = false }) {
  const normalizedPath = typeof projectPath === 'string' ? path.resolve(projectPath.trim()) : '';
  const normalizedName = resolveProjectNameFromPath(normalizedPath, name);

  if (!normalizedName) {
    throw new AppError(400, 'Validation error', 'name must be a non-empty string.');
  }

  if (!normalizedPath) {
    throw new AppError(400, 'Validation error', 'projectPath must be a non-empty string.');
  }

  await ensureDir(PROJECTS_DIR);

  const projectId = makeProjectId(normalizedName, normalizedPath);
  const projectDir = getProjectDir(projectId);
  const sessionsDir = getSessionsDir(projectId);
  const projectFile = getProjectFile(projectId);
  const db = getDb();

  const existingRow = db
    .prepare(`SELECT id, name, project_path, created_at, updated_at FROM projects WHERE id = ?`)
    .get(projectId);

  if (existingRow) {
    if (failIfExists) {
      throw new AppError(409, 'Conflict', 'Project with same name/path already exists.');
    }

    return mapProjectRow(existingRow);
  }

  if (await fileExists(projectFile)) {
    if (failIfExists) {
      throw new AppError(409, 'Conflict', 'Project with same name/path already exists.');
    }

    const existing = await readJson(projectFile, null);
    if (existing) {
      upsertProjectDb(existing);
      return existing;
    }
  }

  const now = new Date().toISOString();
  const project = {
    id: projectId,
    name: normalizedName,
    projectPath: normalizedPath,
    createdAt: now,
    updatedAt: now,
  };

  await ensureDir(projectDir);
  await ensureDir(sessionsDir);
  await writeJson(projectFile, project);
  upsertProjectDb(project);

  return project;
}

async function createProject({ name, projectPath }) {
  return upsertProjectRecord({ name, projectPath, failIfExists: true });
}

const syncCache = new Map();
const SYNC_CACHE_TTL_MS = 5000;

async function syncProjectsFromMasterRoot(masterProjectRoot) {
  const normalizedRoot = typeof masterProjectRoot === 'string' ? path.resolve(masterProjectRoot.trim()) : '';

  if (!normalizedRoot) {
    throw new AppError(400, 'Validation error', 'masterProjectRoot is required.');
  }

  const cached = syncCache.get(normalizedRoot);
  if (cached && Date.now() - cached.ts < SYNC_CACHE_TTL_MS) {
    return cached.promise;
  }

  const promise = (async () => {
    let stat;
    try {
      stat = await fs.stat(normalizedRoot);
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new AppError(400, 'Validation error', 'masterProjectRoot does not exist.');
      }

      throw error;
    }

    if (!stat.isDirectory()) {
      throw new AppError(400, 'Validation error', 'masterProjectRoot must be a directory.');
    }

    const entries = await fs.readdir(normalizedRoot, { withFileTypes: true });
    const dirs = entries.filter((entry) => entry.isDirectory());
    const results = await Promise.all(
      dirs.map((entry) =>
        upsertProjectRecord({
          name: entry.name,
          projectPath: path.join(normalizedRoot, entry.name),
          failIfExists: false,
        }).catch(() => null),
      ),
    );

    return results.filter(Boolean);
  })();

  syncCache.set(normalizedRoot, { ts: Date.now(), promise });
  promise.catch(() => syncCache.delete(normalizedRoot));
  return promise;
}

async function touchProject(projectId) {
  const project = await getProjectOrThrow(projectId);
  const updated = {
    ...project,
    updatedAt: new Date().toISOString(),
  };

  await writeJson(getProjectFile(projectId), updated);
  upsertProjectDb(updated);
  return updated;
}

async function listSessions(projectId) {
  await getProjectOrThrow(projectId);
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, title, created_at, updated_at, messages_json
       FROM sessions
       WHERE project_id = ?
       ORDER BY updated_at DESC`,
    )
    .all(projectId);

  if (rows.length > 0) {
    return rows.map((row) => {
      let messages = [];
      try {
        const parsed = JSON.parse(row.messages_json || '[]');
        messages = Array.isArray(parsed) ? parsed : [];
      } catch (_error) {
        messages = [];
      }

      return {
        id: row.id,
        title: row.title,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        messageCount: messages.length,
      };
    });
  }

  const sessionsDir = getSessionsDir(projectId);
  await ensureDir(sessionsDir);
  const files = await fs.readdir(sessionsDir, { withFileTypes: true });
  const jsonFiles = files.filter((file) => file.isFile() && file.name.endsWith('.json'));

  const results = await Promise.all(
    jsonFiles.map(async (file) => {
      const session = await readJson(path.join(sessionsDir, file.name), null);
      if (session && isSafeSessionId(session.id)) {
        upsertSessionDb({
          ...session,
          projectId,
          preferences: normalizeSessionPreferences(session.preferences),
          messages: Array.isArray(session.messages) ? session.messages : [],
        });

        return {
          id: session.id,
          title: session.title,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
          messageCount: Array.isArray(session.messages) ? session.messages.length : 0,
        };
      }
      return null;
    }),
  );

  return results
    .filter(Boolean)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

async function getSession(projectId, sessionId) {
  await getProjectOrThrow(projectId);
  const db = getDb();
  let session = mapSessionRow(
    db.prepare(
      `SELECT id, project_id, title, created_at, updated_at, preferences_json, messages_json
       FROM sessions
       WHERE project_id = ? AND id = ?`,
    ).get(projectId, sessionId),
  );

  if (!session) {
    const sessionFile = getSessionFile(projectId, sessionId);

    if (!(await fileExists(sessionFile))) {
      throw new AppError(404, 'Not found', 'Session not found.');
    }

    const legacy = await readJson(sessionFile, null);
    if (!legacy) {
      throw new AppError(404, 'Not found', 'Session not found.');
    }

    session = {
      ...legacy,
      projectId,
      preferences: normalizeSessionPreferences(legacy.preferences),
      messages: Array.isArray(legacy.messages) ? legacy.messages : [],
    };
    upsertSessionDb(session);
  }

  return session;
}

async function persistSession(projectId, session) {
  await writeJson(getSessionFile(projectId, session.id), session);
  upsertSessionDb(session);
}

async function updateSessionTitle(projectId, sessionId, title) {
  const session = await getSession(projectId, sessionId);
  session.title = typeof title === 'string' ? title.trim() : '';
  session.updatedAt = new Date().toISOString();
  await persistSession(projectId, session);
  await touchProject(projectId);
  return session;
}

async function deleteSession(projectId, sessionId) {
  await getProjectOrThrow(projectId);
  const sessionFile = getSessionFile(projectId, sessionId);
  const db = getDb();
  const result = db.prepare(`DELETE FROM sessions WHERE project_id = ? AND id = ?`).run(projectId, sessionId);

  if (!(await fileExists(sessionFile)) && result.changes === 0) {
    throw new AppError(404, 'Not found', 'Session not found.');
  }

  if (await fileExists(sessionFile)) {
    await fs.unlink(sessionFile);
  }

  await touchProject(projectId);
  return { id: sessionId };
}

async function createSession(projectId, { title }) {
  const project = await getProjectOrThrow(projectId);
  const normalizedTitle = typeof title === 'string' ? title.trim() : '';
  const now = new Date().toISOString();
  const sessionId = makeSessionId(getProjectFolderName(project) || project.name || projectId);

  const session = {
    id: sessionId,
    projectId,
    title: normalizedTitle,
    createdAt: now,
    updatedAt: now,
    preferences: { ...DEFAULT_SESSION_PREFERENCES },
    messages: [],
  };

  await persistSession(projectId, session);
  await touchProject(projectId);
  return session;
}

function normalizeMessage(message) {
  const role = typeof message.role === 'string' ? message.role : 'assistant';
  const content = typeof message.content === 'string' ? message.content : '';
  const provider = typeof message.provider === 'string' ? message.provider : null;
  const model = typeof message.model === 'string' ? message.model.trim() : '';
  const reasoning = typeof message.reasoning === 'string' ? message.reasoning.trim() : '';
  const mode = typeof message.mode === 'string' ? message.mode.trim() : '';

  const payload = {
    id: makeId('m'),
    role,
    provider,
    content,
    createdAt: new Date().toISOString(),
  };

  if (model) {
    payload.model = model;
  }

  if (reasoning) {
    payload.reasoning = reasoning;
  }

  if (mode) {
    payload.mode = mode;
  }

  return payload;
}

async function appendMessages(projectId, sessionId, messages) {
  const session = await getSession(projectId, sessionId);

  for (const message of messages) {
    session.messages.push(normalizeMessage(message));
  }

  session.updatedAt = new Date().toISOString();
  await persistSession(projectId, session);
  await touchProject(projectId);
  return session;
}

async function undoLastTurn(projectId, sessionId) {
  const session = await getSession(projectId, sessionId);
  if (!Array.isArray(session.messages) || session.messages.length === 0) {
    throw new AppError(400, 'Validation error', 'Session tidak punya pesan untuk di-undo.');
  }

  let removeCount = 0;
  for (let index = session.messages.length - 1; index >= 0; index -= 1) {
    const message = session.messages[index];
    removeCount += 1;
    if (message && message.role === 'user') {
      break;
    }
  }

  const targetIndex = session.messages.length - removeCount;
  const targetMessage = session.messages[targetIndex];
  if (!targetMessage || targetMessage.role !== 'user') {
    throw new AppError(400, 'Validation error', 'Undo hanya tersedia untuk giliran chat terakhir.');
  }

  session.messages.splice(targetIndex, removeCount);
  session.updatedAt = new Date().toISOString();
  await persistSession(projectId, session);
  await touchProject(projectId);

  return {
    session,
    removedCount: removeCount,
  };
}

async function setSessionPreferences(projectId, sessionId, nextPreferences) {
  const session = await getSession(projectId, sessionId);
  session.preferences = normalizeSessionPreferences({
    ...session.preferences,
    ...nextPreferences,
  });
  session.updatedAt = new Date().toISOString();
  await persistSession(projectId, session);
  await touchProject(projectId);
  return session;
}

module.exports = {
  listProjects,
  createProject,
  syncProjectsFromMasterRoot,
  listSessions,
  updateSessionTitle,
  deleteSession,
  createSession,
  getProject: getProjectOrThrow,
  getSession,
  appendMessages,
  undoLastTurn,
  setSessionPreferences,
};
