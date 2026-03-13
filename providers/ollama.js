const { runCommand, escapeShellArg } = require('../utils/exec');
const { getProviderModelConfig } = require('../config/provider-models');

function normalizeModel(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

async function ask(prompt, options = {}) {
  const config = getProviderModelConfig('ollama');
  const desiredModel = normalizeModel(options.model);
  const model = desiredModel || config.defaultModel || 'deepseek-coder';
  return runCommand(`ollama run ${escapeShellArg(model)} ${escapeShellArg(prompt)}`, options);
}

module.exports = { ask };
