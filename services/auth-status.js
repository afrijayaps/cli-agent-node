const fs = require('fs');
const os = require('os');
const path = require('path');
const { runCommand } = require('../utils/exec');

const AUTH_STATUS_TIMEOUT_MS = 15000;

function stripAnsi(value) {
  return String(value || '').replace(
    /[\u001b\u009b][[\]()#;?]*(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-ORZcf-ntqry=><])/g,
    '',
  );
}

function extractStatus(text) {
  const clean = stripAnsi(text).trim();
  if (!clean) {
    return {
      status: 'error',
      details: 'CLI status returned empty output.',
      account: '',
      model: '',
      session: '',
      limit5h: '',
      limitWeekly: '',
    };
  }

  const errorLine = clean
    .split('\n')
    .find((line) => /unrecognized subcommand|unknown subcommand|unexpected argument/i.test(line));
  if (errorLine) {
    return {
      status: 'error',
      details: errorLine.trim().slice(0, 220),
      account: '',
      model: '',
      session: '',
      limit5h: '',
      limitWeekly: '',
    };
  }
  const notLoggedIn = /not logged in/i.test(clean);
  const loggedInLine = clean.split('\n').find((line) => /logged in/i.test(line));
  if (notLoggedIn) {
    return {
      status: 'logged_out',
      details: loggedInLine ? loggedInLine.trim().slice(0, 220) : 'not authenticated',
      account: '',
      model: '',
      session: '',
      limit5h: '',
      limitWeekly: '',
    };
  }

  if (loggedInLine) {
    return {
      status: 'logged_in',
      details: loggedInLine.trim().slice(0, 220),
      account: '',
      model: '',
      session: '',
      limit5h: '',
      limitWeekly: '',
    };
  }

  const accountMatch = clean.match(/^\s*Account:\s*(.+)\s*$/im);
  const limit5hMatch = clean.match(/^\s*5h limit:\s*(.+)\s*$/im);
  const weeklyMatch = clean.match(/^\s*Weekly limit:\s*(.+)\s*$/im);
  const modelMatch = clean.match(/^\s*Model:\s*(.+)\s*$/im);
  const sessionMatch = clean.match(/^\s*Session:\s*(.+)\s*$/im);

  return {
    status: accountMatch ? 'logged_in' : 'logged_out',
    details: accountMatch ? 'authenticated' : 'not authenticated',
    account: accountMatch ? accountMatch[1].trim() : '',
    model: modelMatch ? modelMatch[1].trim() : '',
    session: sessionMatch ? sessionMatch[1].trim() : '',
    limit5h: limit5hMatch ? limit5hMatch[1].trim() : '',
    limitWeekly: weeklyMatch ? weeklyMatch[1].trim() : '',
  };
}

function shouldFallbackToAuthFile(details = '') {
  return /stdin is not a terminal|refusing to start the interactive tui|term is set to \"dumb\"|failed to create pseudo-terminal|permission denied/i.test(
    details,
  );
}

function isTimeoutDetails(details = '') {
  return /timed out/i.test(String(details || ''));
}

function resolveCodexAuthCandidates() {
  const homeDir = os.homedir();
  const codexHome =
    typeof process.env.CODEX_HOME === 'string' && process.env.CODEX_HOME.trim().length > 0
      ? path.resolve(process.env.CODEX_HOME.trim())
      : '';
  const fallbackPath = path.join(homeDir, '.codex', 'auth.json');

  if (!codexHome) {
    return [fallbackPath];
  }

  const candidates = [
    path.join(codexHome, 'auth.json'),
    path.join(codexHome, '.codex', 'auth.json'),
    fallbackPath,
  ];

  return Array.from(new Set(candidates));
}

function parseAuthFile(text) {
  try {
    const data = JSON.parse(text);
    const tokens = data && data.tokens ? data.tokens : {};
    const hasToken =
      Boolean(tokens && tokens.refresh_token) ||
      Boolean(tokens && tokens.access_token) ||
      Boolean(tokens && tokens.id_token);
    return {
      status: hasToken ? 'logged_in' : 'logged_out',
      details: hasToken ? 'authenticated (auth.json)' : 'not authenticated (auth.json)',
      account: '',
      model: '',
      session: '',
      limit5h: '',
      limitWeekly: '',
    };
  } catch (error) {
    return {
      status: 'error',
      details: 'invalid auth file',
      account: '',
      model: '',
      session: '',
      limit5h: '',
      limitWeekly: '',
    };
  }
}

async function getAuthStatusFromAuthFile() {
  const candidates = resolveCodexAuthCandidates();

  for (const authPath of candidates) {
    try {
      const raw = await fs.promises.readFile(authPath, 'utf8');
      if (!raw) {
        return {
          status: 'logged_out',
          details: 'auth file empty',
          account: '',
          model: '',
          session: '',
          limit5h: '',
          limitWeekly: '',
        };
      }
      return parseAuthFile(raw);
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        continue;
      }
      return {
        status: 'error',
        details: 'auth file read failed',
        account: '',
        model: '',
        session: '',
        limit5h: '',
        limitWeekly: '',
      };
    }
  }

  return {
    status: 'logged_out',
    details: 'auth file missing',
    account: '',
    model: '',
    session: '',
    limit5h: '',
    limitWeekly: '',
  };
}

async function getAuthStatus(provider = 'codex') {
  if (provider !== 'codex') {
    const error = new Error('provider is not supported for auth status.');
    error.code = 'UNSUPPORTED_PROVIDER';
    throw error;
  }

  try {
    const output = await runCommand('printf "/status\\n" | script -q /dev/null -c codex', {
      timeoutMs: AUTH_STATUS_TIMEOUT_MS,
      captureStderr: true,
    });
    const raw =
      output && (output.stdout || output.stderr)
        ? [output.stdout, output.stderr].find((value) => value && value.trim().length > 0) || ''
        : '';
    const parsed = extractStatus(raw);
    if (parsed.status === 'error' && (shouldFallbackToAuthFile(parsed.details) || isTimeoutDetails(parsed.details))) {
      return await getAuthStatusFromAuthFile();
    }
    return parsed;
  } catch (error) {
    if (error && error.isCliError) {
      const details = String(error.details || '');
      if (shouldFallbackToAuthFile(details) || isTimeoutDetails(details)) {
        return await getAuthStatusFromAuthFile();
      }
    }
    throw error;
  }
}

module.exports = { getAuthStatus };
