const { AppError } = require('./errors');
const {
  PROJECTS_DIR,
  ensureDir,
  fileExists,
  readJson,
  writeJson,
  fs,
  path,
} = require('./storage');

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

  const newPattern = /^[a-z0-9._-]+::[a-z0-9]{6}$/i;
  return newPattern.test(value);
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
  return updated;
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

  // Backward compatibility for old one-level project IDs.
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

async function getProjectOrThrow(projectId) {
  const projectFile = getProjectFile(projectId);
  const project = await readJson(projectFile, null);

  if (!project) {
    throw new AppError(404, 'Not found', 'Project not found.');
  }

  return ensureProjectNameSynced(project, projectFile);
}

async function listProjects(options = {}) {
  const masterProjectRoot =
    options && typeof options.masterProjectRoot === 'string' ? path.resolve(options.masterProjectRoot) : null;

  await ensureDir(PROJECTS_DIR);

  const levelOne = await fs.readdir(PROJECTS_DIR, { withFileTypes: true });
  const projects = [];

  for (const nameDir of levelOne) {
    if (!nameDir.isDirectory()) {
      continue;
    }

    const namePath = path.join(PROJECTS_DIR, nameDir.name);
    const legacyProjectFile = path.join(namePath, PROJECT_FILE);
    const legacyProject = await readJson(legacyProjectFile, null);
    if (legacyProject) {
      projects.push(await ensureProjectNameSynced(legacyProject, legacyProjectFile));
      continue;
    }

    const levelTwo = await fs.readdir(namePath, { withFileTypes: true });

    for (const pathDir of levelTwo) {
      if (!pathDir.isDirectory()) {
        continue;
      }

      const projectFile = path.join(namePath, pathDir.name, PROJECT_FILE);
      const project = await readJson(projectFile, null);
      if (project) {
        projects.push(await ensureProjectNameSynced(project, projectFile));
      }
    }
  }

  projects.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  if (!masterProjectRoot) {
    return projects;
  }

  const filtered = [];

  for (const project of projects) {
    if (typeof project.projectPath !== 'string') {
      continue;
    }

    if (!isPathInsideRoot(project.projectPath, masterProjectRoot)) {
      continue;
    }

    if (!(await directoryExists(project.projectPath))) {
      continue;
    }

    filtered.push(project);
  }

  return filtered;
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

  if (await fileExists(projectFile)) {
    if (failIfExists) {
      throw new AppError(409, 'Conflict', 'Project with same name/path already exists.');
    }

    const existing = await readJson(projectFile, null);
    return existing;
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

  return project;
}

async function createProject({ name, projectPath }) {
  return upsertProjectRecord({ name, projectPath, failIfExists: true });
}

async function syncProjectsFromMasterRoot(masterProjectRoot) {
  const normalizedRoot = typeof masterProjectRoot === 'string' ? path.resolve(masterProjectRoot.trim()) : '';

  if (!normalizedRoot) {
    throw new AppError(400, 'Validation error', 'masterProjectRoot is required.');
  }

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
  const synced = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const projectPath = path.join(normalizedRoot, entry.name);
    const project = await upsertProjectRecord({
      name: entry.name,
      projectPath,
      failIfExists: false,
    });

    if (project) {
      synced.push(project);
    }
  }

  return synced;
}

async function touchProject(projectId) {
  const project = await getProjectOrThrow(projectId);
  project.updatedAt = new Date().toISOString();
  await writeJson(getProjectFile(projectId), project);
  return project;
}

async function listSessions(projectId) {
  await getProjectOrThrow(projectId);

  const sessionsDir = getSessionsDir(projectId);
  await ensureDir(sessionsDir);

  const files = await fs.readdir(sessionsDir, { withFileTypes: true });
  const sessions = [];

  for (const file of files) {
    if (!file.isFile() || !file.name.endsWith('.json')) {
      continue;
    }

    const session = await readJson(path.join(sessionsDir, file.name), null);
    if (session && isSafeSessionId(session.id)) {
      sessions.push({
        id: session.id,
        title: session.title,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        messageCount: Array.isArray(session.messages) ? session.messages.length : 0,
      });
    }
  }

  sessions.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  return sessions;
}

async function updateSessionTitle(projectId, sessionId, title) {
  const session = await getSession(projectId, sessionId);
  const nextTitle = typeof title === 'string' ? title.trim() : '';

  session.title = nextTitle;
  session.updatedAt = new Date().toISOString();
  await writeJson(getSessionFile(projectId, sessionId), session);
  await touchProject(projectId);

  return session;
}

async function deleteSession(projectId, sessionId) {
  await getProjectOrThrow(projectId);
  const sessionFile = getSessionFile(projectId, sessionId);

  if (!(await fileExists(sessionFile))) {
    throw new AppError(404, 'Not found', 'Session not found.');
  }

  await fs.unlink(sessionFile);
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

  const sessionFile = getSessionFile(projectId, sessionId);
  await writeJson(sessionFile, session);
  await touchProject(projectId);

  return session;
}

async function getSession(projectId, sessionId) {
  await getProjectOrThrow(projectId);
  const sessionFile = getSessionFile(projectId, sessionId);

  if (!(await fileExists(sessionFile))) {
    throw new AppError(404, 'Not found', 'Session not found.');
  }

  const session = await readJson(sessionFile, null);
  if (!session) {
    throw new AppError(404, 'Not found', 'Session not found.');
  }

  if (!Array.isArray(session.messages)) {
    session.messages = [];
  }

  if (!session.preferences || typeof session.preferences !== 'object') {
    session.preferences = { ...DEFAULT_SESSION_PREFERENCES };
  } else {
    session.preferences = normalizeSessionPreferences(session.preferences);
  }

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
  await writeJson(getSessionFile(projectId, sessionId), session);
  await touchProject(projectId);

  return session;
}

async function setSessionPreferences(projectId, sessionId, nextPreferences) {
  const session = await getSession(projectId, sessionId);
  session.preferences = normalizeSessionPreferences({
    ...session.preferences,
    ...nextPreferences,
  });
  session.updatedAt = new Date().toISOString();
  await writeJson(getSessionFile(projectId, sessionId), session);
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
  setSessionPreferences,
};
