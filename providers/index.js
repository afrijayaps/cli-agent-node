const codex = require('./codex');
const claude = require('./claude');
const antigravity = require('./antigravity');
const ollama = require('./ollama');

const providers = {
  codex,
  claude,
  antigravity,
  ollama,
};

const providerNames = Object.keys(providers);
const DEFAULT_PROVIDER = 'codex';

function isValidProvider(provider) {
  return typeof provider === 'string' && providerNames.includes(provider);
}

module.exports = {
  providers,
  providerNames,
  DEFAULT_PROVIDER,
  isValidProvider,
};
