const { runCommand } = require('../utils/exec');
const { fs, readJson } = require('./storage');
const { getProviderModelConfig } = require('../config/provider-models');

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map();

function getCached(provider) {
  const cached = cache.get(provider);
  if (!cached) {
    return null;
  }
  if (Date.now() - cached.updatedAt > CACHE_TTL_MS) {
    return null;
  }
  return cached;
}

async function listModels(provider) {
  const config = getProviderModelConfig(provider);
  const listCommand = typeof config.listCommand === 'string' ? config.listCommand.trim() : '';
  const listFile = typeof config.listFile === 'string' ? config.listFile.trim() : '';
  const listRefreshCommand =
    typeof config.listRefreshCommand === 'string' ? config.listRefreshCommand.trim() : '';

  if (!listCommand && !listFile) {
    return { models: [], source: 'none' };
  }

  const cached = getCached(provider);
  if (cached) {
    return { models: cached.models, source: 'cache' };
  }

  let models = [];
  let source = 'none';

  if (listRefreshCommand) {
    try {
      await runCommand(listRefreshCommand);
    } catch (_error) {
      // Best-effort refresh. Do not fail model listing if refresh fails.
    }
  }

  if (listCommand) {
    let output;
    try {
      output = await runCommand(listCommand);
    } catch (error) {
      error.isModelListError = true;
      throw error;
    }
    const parsed = typeof config.parseList === 'function' ? config.parseList(output) : [];
    models = parsed;
    source = 'command';
  } else if (listFile) {
    try {
      await fs.access(listFile);
      const payload = await readJson(listFile, null);
      const parsed = typeof config.parseFile === 'function' ? config.parseFile(payload) : [];
      models = parsed;
      source = 'file';
    } catch (_error) {
      return { models: [], source: 'none' };
    }
  }

  const normalized = Array.from(
    new Set(
      (Array.isArray(models) ? models : [])
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter((item) => item.length > 0),
    ),
  );

  cache.set(provider, { updatedAt: Date.now(), models: normalized });
  return { models: normalized, source };
}

module.exports = {
  listModels,
  CACHE_TTL_MS,
};
