const { runCommand, escapeShellArg } = require('../utils/exec');

async function ask(prompt, options = {}) {
  return runCommand(`ollama run deepseek-coder ${escapeShellArg(prompt)}`, options);
}

module.exports = { ask };
