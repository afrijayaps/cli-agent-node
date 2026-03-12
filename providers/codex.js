const { runCommand, escapeShellArg } = require('../utils/exec');

function makeTempFilePath() {
  const stamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `/tmp/codex-last-${stamp}-${random}.txt`;
}

async function ask(prompt, options = {}) {
  const outputFile = makeTempFilePath();
  const escapedOutputFile = escapeShellArg(outputFile);
  const escapedPrompt = escapeShellArg(prompt);

  // `codex exec` is non-interactive and safe to call from HTTP requests.
  const command = [
    `codex exec --color never --skip-git-repo-check --output-last-message ${escapedOutputFile} ${escapedPrompt} >/dev/null`,
    'RC=$?',
    `if [ -f ${escapedOutputFile} ]; then cat ${escapedOutputFile}; rm -f ${escapedOutputFile}; fi`,
    'exit $RC',
  ].join('; ');

  return runCommand(command, options);
}

module.exports = { ask };
