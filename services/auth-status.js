const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { runCommand, escapeShellArg } = require('../utils/exec');

const AUTH_STATUS_TIMEOUT_MS = 15000;
const AUTH_LOGOUT_TIMEOUT_MS = 15000;
const DEVICE_AUTH_WAIT_MS = 20000;
const CLAUDE_LOGIN_READY_WAIT_MS = 4000;
const CLAUDE_LOGIN_MAX_RUNTIME_MS = 5 * 60 * 1000;

let activeClaudeLogin = null;

function stripAnsi(value) {
  return String(value || '').replace(
    /[\u001b\u009b][[\]()#;?]*(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-ORZcf-ntqry=><])/g,
    '',
  );
}

function decodeJwtPayload(token) {
  if (typeof token !== 'string' || token.trim().length === 0) {
    return null;
  }

  const parts = token.split('.');
  if (parts.length < 2) {
    return null;
  }

  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
  } catch (_error) {
    return null;
  }
}

function extractEmailFromText(text) {
  if (typeof text !== 'string' || text.trim().length === 0) {
    return '';
  }

  const match = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0].trim() : '';
}

function extractAccountFromTokens(tokens = {}) {
  const payloads = [
    decodeJwtPayload(tokens.access_token),
    decodeJwtPayload(tokens.id_token),
  ].filter(Boolean);

  for (const payload of payloads) {
    if (typeof payload.email === 'string' && payload.email.trim().length > 0) {
      return payload.email.trim();
    }

    const profile =
      payload['https://api.openai.com/profile'] &&
      typeof payload['https://api.openai.com/profile'] === 'object'
        ? payload['https://api.openai.com/profile']
        : null;
    if (profile && typeof profile.email === 'string' && profile.email.trim().length > 0) {
      return profile.email.trim();
    }
  }

  return '';
}

function extractStatus(text) {
  const clean = stripAnsi(text).trim();
  const knownEmail = extractEmailFromText(clean);
  if (!clean) {
    return {
      status: 'error',
      details: 'CLI status returned empty output.',
      source: 'cli login status',
      account: '',
      email: '',
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
      source: 'cli login status',
      account: '',
      email: '',
      model: '',
      session: '',
      limit5h: '',
      limitWeekly: '',
    };
  }
  const loggedOutLine = clean.split('\n').find((line) => /logged out|not logged in/i.test(line));
  const loggedInLine = clean.split('\n').find((line) => /logged in/i.test(line));
  const accountMatch = clean.match(/^\s*Account:\s*(.+)\s*$/im);
  const limit5hMatch = clean.match(/^\s*5h limit:\s*(.+)\s*$/im);
  const weeklyMatch = clean.match(/^\s*Weekly limit:\s*(.+)\s*$/im);
  const modelMatch = clean.match(/^\s*Model:\s*(.+)\s*$/im);
  const sessionMatch = clean.match(/^\s*Session:\s*(.+)\s*$/im);
  const emailMatch = clean.match(/^\s*Email:\s*(.+)\s*$/im);
  const accountValue = accountMatch ? accountMatch[1].trim() : '';
  const emailValue =
    (emailMatch ? extractEmailFromText(emailMatch[1]) : '') ||
    extractEmailFromText(accountValue) ||
    knownEmail;
  if (loggedOutLine) {
    return {
      status: 'logged_out',
      details: loggedOutLine.trim().slice(0, 220),
      source: 'cli login status',
      account: '',
      email: '',
      model: '',
      session: '',
      limit5h: '',
      limitWeekly: '',
    };
  }

  if (loggedInLine && !accountMatch && !modelMatch && !sessionMatch && !limit5hMatch && !weeklyMatch) {
    return {
      status: 'logged_in',
      details: loggedInLine.trim().slice(0, 220),
      source: 'cli login status',
      account: '',
      email: emailValue,
      model: '',
      session: '',
      limit5h: '',
      limitWeekly: '',
    };
  }

  return {
    status: accountMatch || loggedInLine ? 'logged_in' : 'logged_out',
    details: loggedInLine ? loggedInLine.trim().slice(0, 220) : accountMatch ? 'authenticated' : 'not authenticated',
    source: 'cli login status',
    account: accountValue,
    email: emailValue,
    model: modelMatch ? modelMatch[1].trim() : '',
    session: sessionMatch ? sessionMatch[1].trim() : '',
    limit5h: limit5hMatch ? limit5hMatch[1].trim() : '',
    limitWeekly: weeklyMatch ? weeklyMatch[1].trim() : '',
  };
}

function parseClaudeAuthStatus(text) {
  const clean = stripAnsi(text).trim();
  if (!clean) {
    return {
      status: 'error',
      details: 'CLI status returned empty output.',
      source: 'claude auth status',
      account: '',
      email: '',
      model: '',
      session: '',
      limit5h: '',
      limitWeekly: '',
      authMethod: '',
      apiProvider: '',
      orgId: '',
      orgName: '',
      subscriptionType: '',
    };
  }

  try {
    const data = JSON.parse(clean);
    const loggedIn = Boolean(data && data.loggedIn);
    const email =
      data && typeof data.email === 'string' && data.email.trim().length > 0
        ? data.email.trim()
        : extractEmailFromText(clean);

    return {
      status: loggedIn ? 'logged_in' : 'logged_out',
      details: loggedIn ? 'authenticated' : 'not authenticated',
      source: 'claude auth status',
      account: email,
      email,
      model: '',
      session: '',
      limit5h: '',
      limitWeekly: '',
      authMethod:
        data && typeof data.authMethod === 'string' ? data.authMethod.trim() : '',
      apiProvider:
        data && typeof data.apiProvider === 'string' ? data.apiProvider.trim() : '',
      orgId: data && typeof data.orgId === 'string' ? data.orgId.trim() : '',
      orgName: data && typeof data.orgName === 'string' ? data.orgName.trim() : '',
      subscriptionType:
        data && typeof data.subscriptionType === 'string'
          ? data.subscriptionType.trim()
          : '',
    };
  } catch (_error) {
    const loggedOutLine = clean
      .split('\n')
      .find((line) => /logged out|not logged in/i.test(line));
    if (loggedOutLine) {
      return {
        status: 'logged_out',
        details: loggedOutLine.trim().slice(0, 220),
        source: 'claude auth status',
        account: '',
        email: '',
        model: '',
        session: '',
        limit5h: '',
        limitWeekly: '',
        authMethod: '',
        apiProvider: '',
        orgId: '',
        orgName: '',
        subscriptionType: '',
      };
    }

    const email = extractEmailFromText(clean);
    const loggedInLine = clean.split('\n').find((line) => /logged in/i.test(line));
    return {
      status: loggedInLine || email ? 'logged_in' : 'error',
      details: loggedInLine
        ? loggedInLine.trim().slice(0, 220)
        : clean.split('\n')[0].trim().slice(0, 220),
      source: 'claude auth status',
      account: email,
      email,
      model: '',
      session: '',
      limit5h: '',
      limitWeekly: '',
      authMethod: '',
      apiProvider: '',
      orgId: '',
      orgName: '',
      subscriptionType: '',
    };
  }
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

function parseAuthFile(text, source = 'auth.json') {
  try {
    const data = JSON.parse(text);
    const tokens = data && data.tokens ? data.tokens : {};
    const hasToken =
      Boolean(tokens && tokens.refresh_token) ||
      Boolean(tokens && tokens.access_token) ||
      Boolean(tokens && tokens.id_token);
    const account = hasToken ? extractAccountFromTokens(tokens) : '';
    return {
      status: hasToken ? 'logged_in' : 'logged_out',
      details: hasToken ? 'authenticated (auth.json)' : 'not authenticated (auth.json)',
      source,
      account,
      email: account,
      model: '',
      session: '',
      limit5h: '',
      limitWeekly: '',
    };
  } catch (error) {
    return {
      status: 'error',
      details: 'invalid auth file',
      source,
      account: '',
      email: '',
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
          source: authPath,
          account: '',
          email: '',
          model: '',
          session: '',
          limit5h: '',
          limitWeekly: '',
        };
      }
      return parseAuthFile(raw, authPath);
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        continue;
      }
      return {
        status: 'error',
        details: 'auth file read failed',
        source: authPath,
        account: '',
        email: '',
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
    source: 'auth.json',
    account: '',
    email: '',
    model: '',
    session: '',
    limit5h: '',
    limitWeekly: '',
  };
}

async function enrichCodexStatusWithAuthFile(statusPayload) {
  if (!statusPayload || typeof statusPayload !== 'object') {
    return statusPayload;
  }

  if (statusPayload.status !== 'logged_in') {
    return statusPayload;
  }

  const needsAccount = !normalizeStatusValue(statusPayload.account);
  const needsEmail = !normalizeStatusValue(statusPayload.email);
  if (!needsAccount && !needsEmail) {
    return statusPayload;
  }

  const authFileStatus = await getAuthStatusFromAuthFile();
  if (!authFileStatus || authFileStatus.status !== 'logged_in') {
    return statusPayload;
  }

  const nextAccount = needsAccount ? normalizeStatusValue(authFileStatus.account) : '';
  const nextEmail = needsEmail ? normalizeStatusValue(authFileStatus.email) : '';
  if (!nextAccount && !nextEmail) {
    return statusPayload;
  }

  return {
    ...statusPayload,
    account: needsAccount ? nextAccount : statusPayload.account,
    email: needsEmail ? nextEmail : statusPayload.email,
    source:
      nextAccount || nextEmail
        ? `${statusPayload.source || 'cli login status'} + ${authFileStatus.source || 'auth.json'}`
        : statusPayload.source,
  };
}

function normalizeStatusValue(value) {
  return typeof value === 'string' ? value.trim() : '';
}

async function readJsonFileIfExists(filePath) {
  try {
    const raw = await fs.promises.readFile(filePath, 'utf8');
    if (!raw || raw.trim().length === 0) {
      return { exists: true, data: null, empty: true };
    }
    return { exists: true, data: JSON.parse(raw) };
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return { exists: false, data: null };
    }
    return { exists: true, data: null, error: true };
  }
}

async function getClaudeAuthStatusFromFiles() {
  const homeDir = os.homedir();
  const profilePath = path.join(homeDir, '.claude.json');
  const credentialsPath = path.join(homeDir, '.claude', '.credentials.json');
  const [profile, credentials] = await Promise.all([
    readJsonFileIfExists(profilePath),
    readJsonFileIfExists(credentialsPath),
  ]);
  const profileData = profile && profile.data && typeof profile.data === 'object' ? profile.data : {};
  const oauthAccount =
    profileData && profileData.oauthAccount && typeof profileData.oauthAccount === 'object'
      ? profileData.oauthAccount
      : {};
  const credentialsData =
    credentials && credentials.data && typeof credentials.data === 'object' ? credentials.data : {};
  const claudeAiOauth =
    credentialsData &&
    credentialsData.claudeAiOauth &&
    typeof credentialsData.claudeAiOauth === 'object'
      ? credentialsData.claudeAiOauth
      : {};
  const email = normalizeStatusValue(oauthAccount.emailAddress);
  const orgId =
    normalizeStatusValue(credentialsData.organizationUuid) ||
    normalizeStatusValue(oauthAccount.organizationUuid);
  const subscriptionType =
    normalizeStatusValue(claudeAiOauth.subscriptionType) ||
    normalizeStatusValue(oauthAccount.billingType);
  const hasToken =
    Boolean(email) ||
    Boolean(normalizeStatusValue(claudeAiOauth.accessToken)) ||
    Boolean(normalizeStatusValue(claudeAiOauth.refreshToken));
  const sourceParts = [];

  if (profile && profile.exists) {
    sourceParts.push(profilePath);
  }
  if (credentials && credentials.exists) {
    sourceParts.push(credentialsPath);
  }

  if (!profile?.exists && !credentials?.exists) {
    return {
      status: 'logged_out',
      details: 'claude auth files missing',
      source: profilePath,
      account: '',
      email: '',
      model: '',
      session: '',
      limit5h: '',
      limitWeekly: '',
      authMethod: '',
      apiProvider: '',
      orgId: '',
      orgName: '',
      subscriptionType: '',
    };
  }

  if ((profile && profile.error) || (credentials && credentials.error)) {
    return {
      status: 'error',
      details: 'claude auth files unreadable',
      source: sourceParts.join(' + ') || profilePath,
      account: '',
      email: '',
      model: '',
      session: '',
      limit5h: '',
      limitWeekly: '',
      authMethod: '',
      apiProvider: '',
      orgId: '',
      orgName: '',
      subscriptionType: '',
    };
  }

  return {
    status: hasToken ? 'logged_in' : 'logged_out',
    details: hasToken ? 'authenticated (local auth files)' : 'not authenticated (local auth files)',
    source: sourceParts.join(' + ') || profilePath,
    account: email,
    email,
    model: '',
    session: '',
    limit5h: '',
    limitWeekly: '',
    authMethod: hasToken ? 'claude.ai' : '',
    apiProvider: hasToken ? 'firstParty' : '',
    orgId,
    orgName: '',
    subscriptionType,
  };
}

function parseDeviceAuthOutput(rawText) {
  const clean = stripAnsi(String(rawText || '')).replace(/\r/g, '\n');
  const lines = clean
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const urlMatch = clean.match(/https?:\/\/[^\s)]+/i);
  const codeMatch = clean.match(/\b(?:[A-Z0-9]{8}|[A-Z0-9]{4}(?:-[A-Z0-9]{4}){1,2})\b/);

  return {
    details: lines[0] ? lines[0].slice(0, 220) : '',
    verificationUrl: urlMatch ? urlMatch[0] : '',
    userCode: codeMatch ? codeMatch[0] : '',
  };
}

function parseClaudeLoginOutput(rawText) {
  const clean = stripAnsi(String(rawText || '')).replace(/\r/g, '\n');
  const lines = clean
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const details = lines[0] ? lines[0].slice(0, 220) : '';
  const loginUrlMatch = clean.match(/https?:\/\/[^\s)]+/i);
  const lower = clean.toLowerCase();

  if (
    /login failed|failed to start|unable to|operation not permitted|permission denied|already in use|eaddrinuse|eacces|eperm/i.test(
      clean,
    )
  ) {
    return {
      status: 'error',
      details: details || 'Claude login gagal dimulai.',
      loginUrl: loginUrlMatch ? loginUrlMatch[0] : '',
    };
  }

  if (
    /logged in|login successful|successfully signed in|successfully logged in|authentication complete/i.test(
      lower,
    )
  ) {
    return {
      status: 'logged_in',
      details: details || 'Claude login selesai.',
      loginUrl: loginUrlMatch ? loginUrlMatch[0] : '',
    };
  }

  if (loginUrlMatch || /browser|sign in|continue in|open/i.test(lower)) {
    return {
      status: 'pending',
      details: details || 'Claude login sudah dimulai.',
      loginUrl: loginUrlMatch ? loginUrlMatch[0] : '',
    };
  }

  return {
    status: clean ? 'pending' : 'unknown',
    details,
    loginUrl: loginUrlMatch ? loginUrlMatch[0] : '',
  };
}

function buildClaudeLoginPayload(payload = {}) {
  const details =
    typeof payload.details === 'string' && payload.details.trim().length > 0
      ? payload.details.trim()
      : 'Claude login dimulai. Selesaikan flow di browser/server lalu refresh status.';
  const loginUrl =
    typeof payload.loginUrl === 'string' && payload.loginUrl.trim().length > 0
      ? payload.loginUrl.trim()
      : '';

  return {
    source: 'claude auth login',
    command: 'claude auth login',
    status: payload.status || 'pending',
    details: details.slice(0, 220),
    loginUrl,
  };
}

async function getAuthStatus(provider = 'codex') {
  if (provider !== 'codex' && provider !== 'claude') {
    const error = new Error('provider is not supported for auth status.');
    error.code = 'UNSUPPORTED_PROVIDER';
    throw error;
  }

  if (provider === 'claude') {
    try {
      const output = await runCommand(`bash -lc ${escapeShellArg('claude auth status')}`, {
        timeoutMs: AUTH_STATUS_TIMEOUT_MS,
        captureStderr: true,
      });
      const raw =
        output && (output.stdout || output.stderr)
          ? [output.stdout, output.stderr].filter(Boolean).join('\n')
          : '';
      const parsed = parseClaudeAuthStatus(raw);
      if (parsed.status === 'error' && /empty output/i.test(parsed.details)) {
        return await getClaudeAuthStatusFromFiles();
      }
      return parsed;
    } catch (error) {
      if (error && error.isCliError) {
        const details = String(error.details || '');
        if (
          shouldFallbackToAuthFile(details) ||
          isTimeoutDetails(details) ||
          /empty output|permission denied|failed to create pseudo-terminal/i.test(details)
        ) {
          return await getClaudeAuthStatusFromFiles();
        }
      }
      throw error;
    }
  }

  try {
    const output = await runCommand('codex login status', {
      timeoutMs: AUTH_STATUS_TIMEOUT_MS,
      captureStderr: true,
    });
    const raw = output && (output.stdout || output.stderr) ? [output.stdout, output.stderr].filter(Boolean).join('\n') : '';
    const parsed = extractStatus(raw);
    if (
      parsed.status === 'error' &&
      (shouldFallbackToAuthFile(parsed.details) ||
        isTimeoutDetails(parsed.details) ||
        /unrecognized subcommand|unknown subcommand/i.test(parsed.details))
    ) {
      return await getAuthStatusFromAuthFile();
    }
    return await enrichCodexStatusWithAuthFile(parsed);
  } catch (error) {
    if (error && error.isCliError) {
      const details = String(error.details || '');
      if (
        shouldFallbackToAuthFile(details) ||
        isTimeoutDetails(details) ||
        /unrecognized subcommand|unknown subcommand/i.test(details)
      ) {
        return await getAuthStatusFromAuthFile();
      }
    }
    throw error;
  }
}

async function logoutAuth(provider = 'codex') {
  if (provider !== 'codex' && provider !== 'claude') {
    const error = new Error('provider is not supported for auth logout.');
    error.code = 'UNSUPPORTED_PROVIDER';
    throw error;
  }

  if (provider === 'claude') {
    try {
      const output = await runCommand(`bash -lc ${escapeShellArg('claude auth logout')}`, {
        timeoutMs: AUTH_LOGOUT_TIMEOUT_MS,
        captureStderr: true,
      });
      const raw = [output.stdout, output.stderr].filter(Boolean).join('\n').trim();
      const details = stripAnsi(raw).split('\n')[0].slice(0, 220);
      const isLoggedOut = /logged out|logout successful|already logged out|not logged in/i.test(
        raw,
      );
      return {
        status: isLoggedOut ? 'logged_out' : 'unknown',
        details: details || (isLoggedOut ? 'logged out' : 'logout command executed'),
        source: 'claude auth logout',
      };
    } catch (error) {
      if (
        error &&
        error.isCliError &&
        /already logged out|not logged in|logged out/i.test(String(error.details || ''))
      ) {
        return {
          status: 'logged_out',
          details: String(error.details || 'logged out').slice(0, 220),
          source: 'claude auth logout',
        };
      }
      throw error;
    }
  }

  try {
    const output = await runCommand('codex logout', {
      timeoutMs: AUTH_LOGOUT_TIMEOUT_MS,
      captureStderr: true,
    });
    const raw = [output.stdout, output.stderr].filter(Boolean).join('\n').trim();
    const details = stripAnsi(raw).split('\n')[0].slice(0, 220);
    const isLoggedOut = /logged out|logout successful|already logged out|not logged in/i.test(
      raw,
    );
    return {
      status: isLoggedOut ? 'logged_out' : 'unknown',
      details: details || (isLoggedOut ? 'logged out' : 'logout command executed'),
      source: 'codex logout',
    };
  } catch (error) {
    if (
      error &&
      error.isCliError &&
      /already logged out|not logged in|logged out/i.test(String(error.details || ''))
    ) {
      return {
        status: 'logged_out',
        details: String(error.details || 'logged out').slice(0, 220),
        source: 'codex logout',
      };
    }
    throw error;
  }
}

async function startAuthLogin(provider = 'claude') {
  if (provider !== 'claude') {
    const error = new Error('provider is not supported for interactive auth login.');
    error.code = 'UNSUPPORTED_PROVIDER';
    throw error;
  }

  if (activeClaudeLogin && activeClaudeLogin.child && !activeClaudeLogin.settled) {
    return buildClaudeLoginPayload({
      status: activeClaudeLogin.status || 'pending',
      details:
        activeClaudeLogin.details ||
        'Claude login sedang berjalan. Selesaikan flow yang sudah dibuka lalu refresh status.',
      loginUrl: activeClaudeLogin.loginUrl || '',
    });
  }

  return new Promise((resolve, reject) => {
    let responded = false;
    const state = {
      child: null,
      rawOutput: '',
      status: 'pending',
      details: 'Memulai login Claude...',
      loginUrl: '',
      settled: false,
      readyTimer: null,
      runtimeTimer: null,
    };
    activeClaudeLogin = state;

    const clearTimers = () => {
      if (state.readyTimer) {
        clearTimeout(state.readyTimer);
        state.readyTimer = null;
      }
      if (state.runtimeTimer) {
        clearTimeout(state.runtimeTimer);
        state.runtimeTimer = null;
      }
    };

    const resolveOnce = (payload) => {
      if (responded) {
        return;
      }
      responded = true;
      resolve(buildClaudeLoginPayload(payload));
    };

    const rejectOnce = (details) => {
      if (responded) {
        return;
      }
      responded = true;
      reject({
        isCliError: true,
        code: null,
        details: String(details || 'Failed to start Claude login.').slice(0, 300),
      });
    };

    const finalize = (payload = {}) => {
      if (state.settled) {
        return;
      }

      state.settled = true;
      clearTimers();

      if (payload.status) {
        state.status = payload.status;
      }
      if (payload.details) {
        state.details = String(payload.details).trim().slice(0, 220);
      }
      if (payload.loginUrl) {
        state.loginUrl = String(payload.loginUrl).trim();
      }

      activeClaudeLogin = null;
      resolveOnce({
        status: state.status,
        details: state.details,
        loginUrl: state.loginUrl,
      });
    };

    const onChunk = (chunk) => {
      state.rawOutput += String(chunk || '');
      const parsed = parseClaudeLoginOutput(state.rawOutput);

      if (parsed.status && parsed.status !== 'unknown') {
        state.status = parsed.status;
      }
      if (parsed.details) {
        state.details = parsed.details;
      }
      if (parsed.loginUrl) {
        state.loginUrl = parsed.loginUrl;
      }

      if (parsed.status === 'logged_in') {
        finalize(parsed);
        return;
      }

      if (parsed.status === 'pending' && (parsed.loginUrl || state.rawOutput.trim().length > 0)) {
        resolveOnce({
          status: 'pending',
          details:
            parsed.details ||
            'Claude login dimulai. Selesaikan flow di browser/server lalu refresh status.',
          loginUrl: parsed.loginUrl || state.loginUrl,
        });
      }
    };

    const child = spawn('claude', ['auth', 'login'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    state.child = child;

    if (child.stdout) {
      child.stdout.on('data', onChunk);
    }
    if (child.stderr) {
      child.stderr.on('data', onChunk);
    }

    child.once('error', (error) => {
      clearTimers();
      activeClaudeLogin = null;
      if (error && error.code === 'ENOENT') {
        rejectOnce('CLI executable not found in PATH.');
        return;
      }
      rejectOnce(error && error.message ? error.message : 'Failed to start Claude login.');
    });

    child.once('close', (code) => {
      if (state.settled) {
        return;
      }

      const parsed = parseClaudeLoginOutput(state.rawOutput);
      if (code === 0) {
        finalize({
          status: parsed.status === 'unknown' ? 'logged_in' : parsed.status || 'logged_in',
          details:
            parsed.details || 'Claude login selesai. Klik Refresh Claude untuk sinkron status.',
          loginUrl: parsed.loginUrl || state.loginUrl,
        });
        return;
      }

      finalize({
        status: 'error',
        details:
          parsed.details ||
          `Claude login gagal${typeof code === 'number' ? ` (exit ${code})` : ''}. Jalankan claude auth login manual di terminal server jika flow web tidak muncul.`,
        loginUrl: parsed.loginUrl || state.loginUrl,
      });
    });

    state.readyTimer = setTimeout(() => {
      if (state.settled) {
        return;
      }
      resolveOnce({
        status: state.status || 'pending',
        details:
          state.details && state.details !== 'Memulai login Claude...'
            ? state.details
            : 'Claude login dimulai. Jika server headless, buka link yang muncul lalu refresh status.',
        loginUrl: state.loginUrl,
      });
    }, CLAUDE_LOGIN_READY_WAIT_MS);

    state.runtimeTimer = setTimeout(() => {
      if (state.settled) {
        return;
      }
      if (state.child && !state.child.killed) {
        state.child.kill('SIGTERM');
      }
      finalize({
        status: 'error',
        details: 'Timeout menunggu login Claude selesai. Coba ulangi lalu refresh status.',
        loginUrl: state.loginUrl,
      });
    }, CLAUDE_LOGIN_MAX_RUNTIME_MS);
  });
}

async function startDeviceAuth(provider = 'codex') {
  if (provider !== 'codex') {
    const error = new Error('provider is not supported for device auth.');
    error.code = 'UNSUPPORTED_PROVIDER';
    throw error;
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let output = '';
    let timeoutId = null;

    const finish = (payload) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (child && !child.killed) {
        child.kill('SIGTERM');
      }
      resolve({
        source: 'codex login --device-auth',
        command: 'codex login --device-auth',
        status: 'pending',
        details: 'Device auth started.',
        verificationUrl: '',
        userCode: '',
        ...payload,
      });
    };

    const fail = (details) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      reject({
        isCliError: true,
        code: null,
        details: String(details || 'Failed to start device auth.').slice(0, 300),
      });
    };

    const child = spawn('codex', ['login', '--device-auth'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const onChunk = (chunk) => {
      output += String(chunk || '');
      const parsed = parseDeviceAuthOutput(output);
      if (parsed.verificationUrl && parsed.userCode) {
        finish({
          details: parsed.details || 'Open link and paste code to finish login.',
          verificationUrl: parsed.verificationUrl,
          userCode: parsed.userCode,
        });
      }
    };

    if (child.stdout) {
      child.stdout.on('data', onChunk);
    }
    if (child.stderr) {
      child.stderr.on('data', onChunk);
    }

    child.once('error', (error) => {
      if (error && error.code === 'ENOENT') {
        fail('CLI executable not found in PATH.');
        return;
      }
      fail(error && error.message ? error.message : 'Failed to start device auth.');
    });

    child.once('close', (code) => {
      if (settled) {
        return;
      }
      const parsed = parseDeviceAuthOutput(output);
      const details = parsed.details || 'Device auth output unavailable.';
      if (code === 0) {
        finish({
          status: parsed.verificationUrl && parsed.userCode ? 'pending' : 'ok',
          details,
          verificationUrl: parsed.verificationUrl,
          userCode: parsed.userCode,
        });
        return;
      }
      fail(details);
    });

    timeoutId = setTimeout(() => {
      const parsed = parseDeviceAuthOutput(output);
      if (parsed.verificationUrl && parsed.userCode) {
        finish({
          details:
            parsed.details || 'Open link and paste code to finish login, lalu refresh status.',
          verificationUrl: parsed.verificationUrl,
          userCode: parsed.userCode,
        });
        return;
      }
      fail('Timed out waiting for device auth output. Coba jalankan manual di terminal server.');
    }, DEVICE_AUTH_WAIT_MS);
  });
}

module.exports = { getAuthStatus, logoutAuth, startAuthLogin, startDeviceAuth };
