const { DEFAULT_THEME, getThemeById } = require('../config/themes');
const { DEFAULT_PROVIDER, isValidProvider } = require('../providers');
const { DATA_DIR, SETTINGS_FILE, ensureDir, readJson, writeJson, fs, path } = require('./storage');

const DEFAULT_MASTER_PROJECT_ROOT = process.env.MASTER_PROJECT_ROOT || '/www/wwwroot';
const DEFAULT_AI_PRIMARY = isValidProvider(process.env.AI_PRIMARY_PROVIDER)
  ? process.env.AI_PRIMARY_PROVIDER
  : DEFAULT_PROVIDER;
const DEFAULT_AI_FALLBACK = isValidProvider(process.env.AI_FALLBACK_PROVIDER)
  ? process.env.AI_FALLBACK_PROVIDER
  : '';
const DEFAULT_SYSTEM_PROMPT =
  typeof process.env.AI_SYSTEM_PROMPT === 'string' ? process.env.AI_SYSTEM_PROMPT.trim() : '';

function normalizeMasterRoot(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) {
    const error = new Error('masterProjectRoot must be a non-empty absolute path.');
    error.code = 'INVALID_MASTER_ROOT';
    throw error;
  }

  if (!path.isAbsolute(text)) {
    const error = new Error('masterProjectRoot must be an absolute path.');
    error.code = 'INVALID_MASTER_ROOT';
    throw error;
  }

  return path.resolve(text);
}

async function ensureMasterRootExists(masterProjectRoot) {
  try {
    const stat = await fs.stat(masterProjectRoot);
    if (!stat.isDirectory()) {
      const error = new Error('masterProjectRoot must point to a directory.');
      error.code = 'INVALID_MASTER_ROOT';
      throw error;
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      const nextError = new Error('masterProjectRoot does not exist.');
      nextError.code = 'INVALID_MASTER_ROOT';
      throw nextError;
    }

    throw error;
  }
}

async function getSettings() {
  await ensureDir(DATA_DIR);
  const settings = await readJson(SETTINGS_FILE, null);

  const normalized = {
    theme: settings && getThemeById(settings.theme) ? settings.theme : DEFAULT_THEME,
    masterProjectRoot:
      settings && typeof settings.masterProjectRoot === 'string' && settings.masterProjectRoot.trim().length > 0
        ? path.resolve(settings.masterProjectRoot.trim())
        : DEFAULT_MASTER_PROJECT_ROOT,
    aiPrimary:
      settings && typeof settings.aiPrimary === 'string' && isValidProvider(settings.aiPrimary)
        ? settings.aiPrimary
        : DEFAULT_AI_PRIMARY,
    aiFallback:
      settings && typeof settings.aiFallback === 'string' && isValidProvider(settings.aiFallback)
        ? settings.aiFallback
        : DEFAULT_AI_FALLBACK,
    systemPrompt:
      settings && typeof settings.systemPrompt === 'string' ? settings.systemPrompt : DEFAULT_SYSTEM_PROMPT,
  };

  if (normalized.aiFallback && normalized.aiFallback === normalized.aiPrimary) {
    normalized.aiFallback = '';
  }

  if (
    !settings ||
    settings.theme !== normalized.theme ||
    settings.masterProjectRoot !== normalized.masterProjectRoot ||
    settings.aiPrimary !== normalized.aiPrimary ||
    settings.aiFallback !== normalized.aiFallback ||
    settings.systemPrompt !== normalized.systemPrompt
  ) {
    await writeJson(SETTINGS_FILE, normalized);
  }

  return normalized;
}

async function updateSettings(next) {
  const current = await getSettings();
  const updated = { ...current };

  if (next.theme !== undefined) {
    if (!getThemeById(next.theme)) {
      const error = new Error('Invalid theme');
      error.code = 'INVALID_THEME';
      throw error;
    }

    updated.theme = next.theme;
  }

  if (next.masterProjectRoot !== undefined) {
    const normalizedRoot = normalizeMasterRoot(next.masterProjectRoot);
    await ensureMasterRootExists(normalizedRoot);
    updated.masterProjectRoot = normalizedRoot;
  }

  if (next.aiPrimary !== undefined) {
    if (!isValidProvider(next.aiPrimary)) {
      const error = new Error('aiPrimary must be a supported provider.');
      error.code = 'INVALID_PROVIDER';
      throw error;
    }
    updated.aiPrimary = next.aiPrimary;
  }

  if (next.aiFallback !== undefined) {
    if (next.aiFallback === null || next.aiFallback === '') {
      updated.aiFallback = '';
    } else if (!isValidProvider(next.aiFallback)) {
      const error = new Error('aiFallback must be a supported provider.');
      error.code = 'INVALID_PROVIDER';
      throw error;
    } else {
      updated.aiFallback = next.aiFallback;
    }
  }

  if (updated.aiFallback && updated.aiFallback === updated.aiPrimary) {
    updated.aiFallback = '';
  }

  if (next.systemPrompt !== undefined) {
    if (next.systemPrompt === null || next.systemPrompt === '') {
      updated.systemPrompt = '';
    } else if (typeof next.systemPrompt !== 'string') {
      const error = new Error('systemPrompt must be a string.');
      error.code = 'INVALID_SYSTEM_PROMPT';
      throw error;
    } else if (next.systemPrompt.trim().length === 0) {
      updated.systemPrompt = '';
    } else {
      updated.systemPrompt = next.systemPrompt;
    }
  }

  await writeJson(SETTINGS_FILE, updated);
  return updated;
}

module.exports = {
  getSettings,
  updateSettings,
  DEFAULT_MASTER_PROJECT_ROOT,
};
