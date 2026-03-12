const { exec } = require('child_process');

function escapeShellArg(value) {
  const text = String(value);
  return `'${text.replace(/'/g, `'\\''`)}'`;
}

function toSafeCliError(error, stderr) {
  const detailsFromStderr = (stderr || '').trim();
  const code = typeof error.code === 'number' ? error.code : null;
  const message = String(error && error.message ? error.message : '');

  let details = 'CLI process failed.';
  if (error && error.code === 'ENOENT') {
    details = 'CLI executable not found in PATH.';
  } else if (
    /command not found/i.test(detailsFromStderr) ||
    /\bnot found\b/i.test(detailsFromStderr) ||
    /\bnot recognized\b/i.test(detailsFromStderr)
  ) {
    details = 'CLI executable not found in PATH.';
  } else if (detailsFromStderr.length > 0) {
    details = detailsFromStderr.split('\n')[0].slice(0, 300);
  } else if (message.length > 0) {
    details = message.split('\n')[0].slice(0, 300);
  }

  return {
    isCliError: true,
    code,
    details,
  };
}

async function runCommand(command, options = {}) {
  return new Promise((resolve, reject) => {
    let finalCommand = command;
    const execOptions = {
      timeout: 0,
      maxBuffer: 10 * 1024 * 1024,
    };

    if (options && typeof options.cwd === 'string' && options.cwd.trim().length > 0) {
      const cwd = options.cwd.trim();
      execOptions.cwd = cwd;
      finalCommand = `cd ${escapeShellArg(cwd)} && ${command}`;
    }

    exec(finalCommand, execOptions, (error, stdout, stderr) => {
      if (error) {
        reject(toSafeCliError(error, stderr));
        return;
      }

      resolve((stdout || '').trim());
    });
  });
}

module.exports = {
  runCommand,
  escapeShellArg,
};
