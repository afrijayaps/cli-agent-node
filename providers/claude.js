const { runCommand, escapeShellArg } = require('../utils/exec');

async function ask(prompt, options = {}) {
  return runCommand(`claude ${escapeShellArg(prompt)}`, options);
}

module.exports = { ask };
