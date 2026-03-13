const os = require('os');
const path = require('path');

function parseOllamaList(output) {
  const lines = String(output || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return [];
  }

  const headerIndex = lines.findIndex((line) => /^name\\b/i.test(line));
  const dataLines = headerIndex >= 0 ? lines.slice(headerIndex + 1) : lines;

  const models = [];
  for (const line of dataLines) {
    const parts = line.split(/\\s+/);
    if (parts[0]) {
      models.push(parts[0]);
    }
  }

  return models;
}

function parseCodexModels(payload) {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.models)) {
    return [];
  }

  return payload.models
    .filter((model) => model && model.visibility === 'list' && typeof model.slug === 'string')
    .map((model) => model.slug.trim())
    .filter((slug) => slug.length > 0);
}

const CODEX_HOME = process.env.CODEX_HOME || os.homedir();
const CODEX_MODELS_CACHE =
  process.env.CODEX_MODELS_CACHE || path.join(CODEX_HOME, '.codex', 'models_cache.json');

const PROVIDER_MODEL_CONFIG = {
  ollama: {
    listCommand: 'ollama list',
    parseList: parseOllamaList,
    modelStrategy: 'positional',
    defaultModel: 'deepseek-coder',
  },
  codex: {
    listRefreshCommand: 'codex exec --json --skip-git-repo-check "/model" >/dev/null',
    listFile: CODEX_MODELS_CACHE,
    parseFile: parseCodexModels,
    modelStrategy: 'flag',
    defaultModel: '',
  },
  claude: {
    listCommand: '',
    parseList: null,
    modelStrategy: 'none',
    defaultModel: '',
  },
  antigravity: {
    listCommand: '',
    parseList: null,
    modelStrategy: 'none',
    defaultModel: '',
  },
};

function getProviderModelConfig(provider) {
  return PROVIDER_MODEL_CONFIG[provider] || { modelStrategy: 'none', listCommand: '', defaultModel: '' };
}

module.exports = {
  PROVIDER_MODEL_CONFIG,
  getProviderModelConfig,
  parseOllamaList,
  parseCodexModels,
};
