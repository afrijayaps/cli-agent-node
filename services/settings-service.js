const { DEFAULT_THEME, getThemeById } = require('../config/themes');
const { DEFAULT_PROVIDER, isValidProvider } = require('../providers');
const { DATA_DIR, SETTINGS_FILE, ensureDir, readJson, writeJson, fs, path } = require('./storage');
const { getDb } = require('./sqlite');

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
  const db = getDb();
  let row = db
    .prepare(
      `SELECT theme, master_project_root, ai_primary, ai_fallback, system_prompt
       FROM app_settings
       WHERE id = 1`,
    )
    .get();

  if (!row) {
    const legacySettings = await readJson(SETTINGS_FILE, null);
    if (legacySettings) {
      const migrated = {
        theme: legacySettings.theme,
        master_project_root: legacySettings.masterProjectRoot,
        ai_primary: legacySettings.aiPrimary,
        ai_fallback: legacySettings.aiFallback,
        system_prompt: legacySettings.systemPrompt,
      };

      db.prepare(
        `INSERT INTO app_settings (
          id, theme, master_project_root, ai_primary, ai_fallback, system_prompt, updated_at
        ) VALUES (1, ?, ?, ?, ?, ?, ?)`,
      ).run(
        migrated.theme || DEFAULT_THEME,
        migrated.master_project_root || DEFAULT_MASTER_PROJECT_ROOT,
        migrated.ai_primary || DEFAULT_AI_PRIMARY,
        migrated.ai_fallback || DEFAULT_AI_FALLBACK,
        migrated.system_prompt || DEFAULT_SYSTEM_PROMPT,
        new Date().toISOString(),
      );
      row = migrated;
    }
  }

  const normalized = {
    theme: row && getThemeById(row.theme) ? row.theme : DEFAULT_THEME,
    masterProjectRoot:
      row && typeof row.master_project_root === 'string' && row.master_project_root.trim().length > 0
        ? path.resolve(row.master_project_root.trim())
        : DEFAULT_MASTER_PROJECT_ROOT,
    aiPrimary:
      row && typeof row.ai_primary === 'string' && isValidProvider(row.ai_primary)
        ? row.ai_primary
        : DEFAULT_AI_PRIMARY,
    aiFallback:
      row && typeof row.ai_fallback === 'string' && isValidProvider(row.ai_fallback)
        ? row.ai_fallback
        : DEFAULT_AI_FALLBACK,
    systemPrompt:
      row && typeof row.system_prompt === 'string' ? row.system_prompt : DEFAULT_SYSTEM_PROMPT,
  };

  if (normalized.aiFallback && normalized.aiFallback === normalized.aiPrimary) {
    normalized.aiFallback = '';
  }

  if (
    !row ||
    row.theme !== normalized.theme ||
    row.master_project_root !== normalized.masterProjectRoot ||
    row.ai_primary !== normalized.aiPrimary ||
    row.ai_fallback !== normalized.aiFallback ||
    row.system_prompt !== normalized.systemPrompt
  ) {
    db.prepare(
      `INSERT INTO app_settings (
        id, theme, master_project_root, ai_primary, ai_fallback, system_prompt, updated_at
      ) VALUES (1, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        theme = excluded.theme,
        master_project_root = excluded.master_project_root,
        ai_primary = excluded.ai_primary,
        ai_fallback = excluded.ai_fallback,
        system_prompt = excluded.system_prompt,
        updated_at = excluded.updated_at`,
    ).run(
      normalized.theme,
      normalized.masterProjectRoot,
      normalized.aiPrimary,
      normalized.aiFallback,
      normalized.systemPrompt,
      new Date().toISOString(),
    );
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

  const db = getDb();
  db.prepare(
    `INSERT INTO app_settings (
      id, theme, master_project_root, ai_primary, ai_fallback, system_prompt, updated_at
    ) VALUES (1, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      theme = excluded.theme,
      master_project_root = excluded.master_project_root,
      ai_primary = excluded.ai_primary,
      ai_fallback = excluded.ai_fallback,
      system_prompt = excluded.system_prompt,
      updated_at = excluded.updated_at`,
  ).run(
    updated.theme,
    updated.masterProjectRoot,
    updated.aiPrimary,
    updated.aiFallback,
    updated.systemPrompt,
    new Date().toISOString(),
  );
  await writeJson(SETTINGS_FILE, updated);
  return updated;
}

module.exports = {
  getSettings,
  updateSettings,
  DEFAULT_MASTER_PROJECT_ROOT,
};
