const { DEFAULT_THEME, getThemeById } = require('../config/themes');
const { DATA_DIR, SETTINGS_FILE, ensureDir, readJson, writeJson, fs, path } = require('./storage');

const DEFAULT_MASTER_PROJECT_ROOT = process.env.MASTER_PROJECT_ROOT || '/www/wwwroot';

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
  };

  if (
    !settings ||
    settings.theme !== normalized.theme ||
    settings.masterProjectRoot !== normalized.masterProjectRoot
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

  await writeJson(SETTINGS_FILE, updated);
  return updated;
}

module.exports = {
  getSettings,
  updateSettings,
  DEFAULT_MASTER_PROJECT_ROOT,
};
