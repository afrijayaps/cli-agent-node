const { runCommand, escapeShellArg } = require('../utils/exec');

async function ask(prompt) {
  return runCommand(`antigravity ${escapeShellArg(prompt)}`);
}

module.exports = { ask };
