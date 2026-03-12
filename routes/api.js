const express = require('express');
const path = require('path');

const { THEMES } = require('../config/themes');
const { providerNames, DEFAULT_PROVIDER } = require('../providers');
const { AppError } = require('../services/errors');
const { askInSession } = require('../services/chat-service');
const { getSettings, updateSettings } = require('../services/settings-service');
const {
  listProjects,
  createProject,
  syncProjectsFromMasterRoot,
  listSessions,
  createSession,
  getSession,
  getProject,
} = require('../services/project-service');

const router = express.Router();

function isPathInsideRoot(candidatePath, rootPath) {
  const absCandidate = path.resolve(candidatePath);
  const absRoot = path.resolve(rootPath);
  const relative = path.relative(absRoot, absCandidate);

  if (!relative) {
    return true;
  }

  return !relative.startsWith('..') && !path.isAbsolute(relative);
}

function handleError(res, error, fallbackMessage) {
  if (error instanceof AppError) {
    res.status(error.status).json({
      error: error.message,
      details: error.details,
    });
    return;
  }

  if (error && error.code === 'INVALID_THEME') {
    res.status(400).json({
      error: 'Validation error',
      details: 'theme is not supported.',
    });
    return;
  }

  if (error && error.code === 'INVALID_MASTER_ROOT') {
    res.status(400).json({
      error: 'Validation error',
      details: error.message || 'masterProjectRoot is invalid.',
    });
    return;
  }

  if (error && error.isCliError) {
    res.status(502).json({
      error: 'CLI provider execution failed',
      provider: null,
      code: typeof error.code === 'number' ? error.code : null,
      details: error.details || 'Provider command failed.',
    });
    return;
  }

  console.error(fallbackMessage, error);
  res.status(500).json({ error: 'Internal server error' });
}

router.get('/meta', async (_req, res) => {
  try {
    const settings = await getSettings();
    res.status(200).json({
      providers: providerNames,
      defaultProvider: DEFAULT_PROVIDER,
      themes: THEMES,
      settings,
      authMode: 'cli',
    });
  } catch (error) {
    handleError(res, error, 'Failed to load meta:');
  }
});

router.get('/themes', async (_req, res) => {
  try {
    const settings = await getSettings();
    res.status(200).json({ themes: THEMES, currentTheme: settings.theme });
  } catch (error) {
    handleError(res, error, 'Failed to list themes:');
  }
});

router.get('/settings', async (_req, res) => {
  try {
    const settings = await getSettings();
    res.status(200).json(settings);
  } catch (error) {
    handleError(res, error, 'Failed to load settings:');
  }
});

router.put('/settings', async (req, res) => {
  try {
    const settings = await updateSettings(req.body || {});
    res.status(200).json(settings);
  } catch (error) {
    handleError(res, error, 'Failed to update settings:');
  }
});

router.get('/projects', async (_req, res) => {
  try {
    const settings = await getSettings();
    await syncProjectsFromMasterRoot(settings.masterProjectRoot);
    const projects = await listProjects({ masterProjectRoot: settings.masterProjectRoot });
    res.status(200).json({
      projects,
      masterProjectRoot: settings.masterProjectRoot,
    });
  } catch (error) {
    handleError(res, error, 'Failed to list projects:');
  }
});

router.post('/projects', async (req, res) => {
  try {
    const settings = await getSettings();
    const body = req.body || {};

    if (typeof body.projectPath !== 'string' || body.projectPath.trim().length === 0) {
      throw new AppError(400, 'Validation error', 'projectPath must be a non-empty string.');
    }

    if (!isPathInsideRoot(body.projectPath, settings.masterProjectRoot)) {
      throw new AppError(
        400,
        'Validation error',
        'projectPath must be inside masterProjectRoot. Please change masterProjectRoot in settings.',
      );
    }

    const project = await createProject(body);
    res.status(201).json({ project });
  } catch (error) {
    handleError(res, error, 'Failed to create project:');
  }
});

router.get('/projects/:projectId/sessions', async (req, res) => {
  try {
    const sessions = await listSessions(req.params.projectId);
    res.status(200).json({ sessions });
  } catch (error) {
    handleError(res, error, 'Failed to list sessions:');
  }
});

router.post('/projects/:projectId/sessions', async (req, res) => {
  try {
    const settings = await getSettings();
    const project = await getProject(req.params.projectId);

    if (!isPathInsideRoot(project.projectPath, settings.masterProjectRoot)) {
      throw new AppError(
        400,
        'Validation error',
        'projectPath must be inside masterProjectRoot. Please change masterProjectRoot in settings.',
      );
    }

    const session = await createSession(req.params.projectId, req.body || {});
    res.status(201).json({ session });
  } catch (error) {
    handleError(res, error, 'Failed to create session:');
  }
});

router.get('/projects/:projectId/sessions/:sessionId', async (req, res) => {
  try {
    const session = await getSession(req.params.projectId, req.params.sessionId);
    res.status(200).json({ session });
  } catch (error) {
    handleError(res, error, 'Failed to load session:');
  }
});

router.post('/projects/:projectId/sessions/:sessionId/ask', async (req, res) => {
  const payload = {
    projectId: req.params.projectId,
    sessionId: req.params.sessionId,
    provider: req.body ? req.body.provider : undefined,
    prompt: req.body ? req.body.prompt : undefined,
  };

  try {
    const response = await askInSession(payload);
    res.status(200).json(response);
  } catch (error) {
    if (error && error.isCliError) {
      res.status(502).json({
        error: 'CLI provider execution failed',
        provider: payload.provider || null,
        code: typeof error.code === 'number' ? error.code : null,
        details: error.details || 'Provider command failed.',
      });
      return;
    }

    handleError(res, error, 'Failed to ask in session:');
  }
});

router.post('/restart', async (_req, res) => {
  try {
    res.status(200).json({
      ok: true,
      message: 'Server restart initiated. Ensure a process manager is running.',
    });

    setTimeout(() => {
      process.exit(0);
    }, 300);
  } catch (error) {
    handleError(res, error, 'Failed to restart server:');
  }
});

module.exports = router;
