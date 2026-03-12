const { runCommand, escapeShellArg } = require('../utils/exec');

async function ask(prompt) {
  return runCommand(`claude ${escapeShellArg(prompt)}`);
}

module.exports = { ask };
