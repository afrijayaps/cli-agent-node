const { runCommand, escapeShellArg } = require('../utils/exec');

async function ask(prompt, options = {}) {
  return runCommand(`antigravity ${escapeShellArg(prompt)}`, options);
}

module.exports = { ask };
