const { runCommand, escapeShellArg } = require('../utils/exec');

async function ask(prompt) {
  return runCommand(`ollama run deepseek-coder ${escapeShellArg(prompt)}`);
}

module.exports = { ask };
