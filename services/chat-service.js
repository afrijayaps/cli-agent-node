const crypto = require('crypto');
const { AppError } = require('./errors');
const { providers, isValidProvider, DEFAULT_PROVIDER } = require('../providers');
const { appendMessages, getSession, getProject, setSessionPreferences } = require('./project-service');
const { getSettings } = require('./settings-service');
const { getAuthStatus } = require('./auth-status');
const { logInfo, logError } = require('./logger');
const { startJob, endJob } = require('./job-registry');

const REASONING_LEVELS = ['low', 'medium', 'high', 'xhigh'];
const MODE_LEVELS = ['normal', 'plan'];
const STATUS_COMMAND_PATTERN = /^\s*\/status(?:@\S+)?(?:\s+.*)?$/i;
const inflightSessionRequests = new Map();

function normalizeReasoning(value) {
  if (typeof value !== 'string') {
    return 'medium';
  }
  const normalized = value.trim();
  if (normalized === 'standard') {
    return 'medium';
  }
  if (normalized === 'deep') {
    return 'high';
  }
  return REASONING_LEVELS.includes(normalized) ? normalized : 'medium';
}

function normalizeMode(value) {
  if (typeof value !== 'string') {
    return 'normal';
  }
  const normalized = value.trim();
  return MODE_LEVELS.includes(normalized) ? normalized : 'normal';
}

function normalizeModel(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

function validateAskPayload({ provider, prompt, model, reasoning, mode }, defaultProvider = DEFAULT_PROVIDER) {
  const normalizedProvider =
    typeof provider === 'string' && provider.trim().length > 0 ? provider.trim() : defaultProvider;

  if (!isValidProvider(normalizedProvider)) {
    throw new AppError(400, 'Validation error', 'provider must be one of: codex, claude, antigravity, ollama.');
  }

  if (typeof prompt !== 'string' || prompt.trim().length === 0) {
    throw new AppError(400, 'Validation error', 'prompt must be a non-empty string.');
  }

  return {
    provider: normalizedProvider,
    prompt,
    model: normalizeModel(model),
    reasoning: normalizeReasoning(reasoning),
    mode: normalizeMode(mode),
  };
}

function resolvePrimaryProvider(requestedProvider, settings) {
  if (typeof requestedProvider === 'string' && requestedProvider.trim().length > 0) {
    return requestedProvider.trim();
  }

  if (settings && typeof settings.aiPrimary === 'string' && isValidProvider(settings.aiPrimary)) {
    return settings.aiPrimary;
  }

  return DEFAULT_PROVIDER;
}

function resolveFallbackProvider(settings, primary) {
  if (!settings || typeof settings.aiFallback !== 'string') {
    return '';
  }

  const fallback = settings.aiFallback.trim();
  if (!fallback || !isValidProvider(fallback)) {
    return '';
  }

  if (fallback === primary) {
    return '';
  }

  return fallback;
}

function buildPreamble(reasoning, mode) {
  const lines = [];
  if (reasoning && reasoning !== 'medium') {
    lines.push(`Reasoning: ${reasoning}`);
  }
  if (mode && mode !== 'normal') {
    lines.push(`Mode: ${mode}`);
  }
  return lines.join('\n');
}

function toSingleLine(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value
    .split(/\r?\n+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' ');
}

function composePrompt(prompt, settings, reasoning, mode) {
  const systemText = toSingleLine(
    settings && typeof settings.systemPrompt === 'string' ? settings.systemPrompt : '',
  );
  const preamble = toSingleLine(buildPreamble(reasoning, mode));

  if (!systemText && !preamble) {
    return prompt;
  }

  const blocks = [];
  if (systemText) {
    blocks.push(systemText);
  }
  if (preamble) {
    blocks.push(preamble);
  }
  blocks.push(prompt);
  return blocks.join('\n\n');
}

function hashPrompt(prompt) {
  return crypto.createHash('sha256').update(String(prompt)).digest('hex');
}

function makePromptKey({
  projectId,
  sessionId,
  provider,
  model,
  reasoning,
  mode,
  prompt,
}) {
  const promptHash = hashPrompt(prompt);
  return [
    projectId || '',
    sessionId || '',
    provider || '',
    model || '',
    reasoning || '',
    mode || '',
    promptHash,
  ].join('::');
}

function normalizeProviderResult(result) {
  if (typeof result === 'string') {
    return {
      text: result,
      progress: [],
    };
  }

  if (!result || typeof result !== 'object') {
    return {
      text: '',
      progress: [],
    };
  }

  return {
    text: typeof result.text === 'string' ? result.text : '',
    progress: Array.isArray(result.progress)
      ? result.progress.filter((item) => typeof item === 'string' && item.trim().length > 0)
      : [],
  };
}

function containsStatusCommand(prompt) {
  if (typeof prompt !== 'string') {
    return false;
  }

  return STATUS_COMMAND_PATTERN.test(prompt);
}

function normalizeStatusField(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function formatStatusOutput(statusPayload) {
  const status = normalizeStatusField(statusPayload && statusPayload.status) || 'unknown';
  const details = normalizeStatusField(statusPayload && statusPayload.details);
  const account = normalizeStatusField(statusPayload && statusPayload.account);
  const model = normalizeStatusField(statusPayload && statusPayload.model);
  const session = normalizeStatusField(statusPayload && statusPayload.session);
  const limit5h = normalizeStatusField(statusPayload && statusPayload.limit5h);
  const limitWeekly = normalizeStatusField(statusPayload && statusPayload.limitWeekly);

  const lines = [`Status (/status): ${status}`];

  if (details) {
    lines.push(`Details: ${details}`);
  }
  if (account) {
    lines.push(`Account: ${account}`);
  }
  if (model) {
    lines.push(`Model: ${model}`);
  }
  if (session) {
    lines.push(`Session: ${session}`);
  }
  if (limit5h) {
    lines.push(`5h limit: ${limit5h}`);
  }
  if (limitWeekly) {
    lines.push(`Weekly limit: ${limitWeekly}`);
  }

  return lines.join('\n');
}

function formatStatusError(error) {
  const details =
    (error && typeof error.details === 'string' && error.details.trim()) ||
    (error && typeof error.message === 'string' && error.message.trim()) ||
    'status check failed';
  return `Status (/status): error\nDetails: ${details}`;
}

async function getCodexStatusText() {
  try {
    const statusPayload = await getAuthStatus('codex');
    return formatStatusOutput(statusPayload);
  } catch (error) {
    return formatStatusError(error);
  }
}

async function askProvider({ provider, prompt, model, reasoning, mode }) {
  const settings = await getSettings();
  const primaryProvider = resolvePrimaryProvider(provider, settings);
  const normalized = validateAskPayload(
    { provider: primaryProvider, prompt, model, reasoning, mode },
    primaryProvider,
  );
  if (containsStatusCommand(normalized.prompt)) {
    return await getCodexStatusText();
  }

  const fallbackProvider = resolveFallbackProvider(settings, normalized.provider);
  const effectivePrompt = composePrompt(normalized.prompt, settings, normalized.reasoning, normalized.mode);
  const startedAt = Date.now();
  const abortController = typeof AbortController === 'function' ? new AbortController() : null;
  const jobId = startJob({
    type: 'provider',
    provider: normalized.provider,
    fallbackProvider,
    model: normalized.model || '',
    reasoning: normalized.reasoning,
    mode: normalized.mode,
    promptChars: normalized.prompt.length,
    cancel: (reason) => {
      if (abortController) {
        abortController.abort(reason);
      }
    },
  });

  logInfo('ask_provider_start', {
    provider: normalized.provider,
    fallbackProvider,
    model: normalized.model || '',
    reasoning: normalized.reasoning,
    mode: normalized.mode,
    promptChars: normalized.prompt.length,
  });

  try {
    const result = await providers[normalized.provider].ask(effectivePrompt, {
      model: normalized.model,
      reasoning: normalized.reasoning,
      signal: abortController ? abortController.signal : undefined,
    });
    const normalizedResult = normalizeProviderResult(result);
    logInfo('ask_provider_success', {
      provider: normalized.provider,
      durationMs: Date.now() - startedAt,
    });
    return normalizedResult.text;
  } catch (error) {
    if (error && error.isAbortError) {
      throw error;
    }
    if (fallbackProvider) {
      try {
        const result = await providers[fallbackProvider].ask(effectivePrompt, {
          model: normalized.model,
          reasoning: normalized.reasoning,
          signal: abortController ? abortController.signal : undefined,
        });
        const normalizedResult = normalizeProviderResult(result);
        logInfo('ask_provider_fallback_success', {
          provider: fallbackProvider,
          durationMs: Date.now() - startedAt,
        });
        return normalizedResult.text;
      } catch (fallbackError) {
        if (fallbackError && fallbackError.isAbortError) {
          throw fallbackError;
        }
        logError('ask_provider_fallback_error', {
          provider: fallbackProvider,
          durationMs: Date.now() - startedAt,
          details: fallbackError && fallbackError.details ? fallbackError.details : fallbackError?.message,
        });
        throw fallbackError;
      }
    }
    logError('ask_provider_error', {
      provider: normalized.provider,
      durationMs: Date.now() - startedAt,
      details: error && error.details ? error.details : error?.message,
    });
    throw error;
  } finally {
    endJob(jobId);
  }
}

async function askInSession({ projectId, sessionId, provider, prompt, model, reasoning, mode }) {
  const settings = await getSettings();
  const primaryProvider = resolvePrimaryProvider(provider, settings);
  const normalized = validateAskPayload(
    { provider: primaryProvider, prompt, model, reasoning, mode },
    primaryProvider,
  );
  const promptKey = makePromptKey({
    projectId,
    sessionId,
    provider: normalized.provider,
    model: normalized.model,
    reasoning: normalized.reasoning,
    mode: normalized.mode,
    prompt: normalized.prompt,
  });
  const existing = inflightSessionRequests.get(promptKey);
  if (existing) {
    return await existing;
  }

  const requestPromise = (async () => {
  const fallbackProvider = resolveFallbackProvider(settings, normalized.provider);
  const project = await getProject(projectId);
  const effectivePrompt = composePrompt(normalized.prompt, settings, normalized.reasoning, normalized.mode);

  await appendMessages(projectId, sessionId, [
    {
      role: 'user',
      provider: normalized.provider,
      content: normalized.prompt,
      model: normalized.model,
      reasoning: normalized.reasoning,
      mode: normalized.mode,
    },
  ]);

  await setSessionPreferences(projectId, sessionId, {
    model: normalized.model,
    reasoning: normalized.reasoning,
    mode: normalized.mode,
  });

  if (containsStatusCommand(normalized.prompt)) {
    const statusText = await getCodexStatusText();

    await appendMessages(projectId, sessionId, [
      {
        role: 'assistant',
        provider: 'system',
        content: statusText,
        model: normalized.model,
        reasoning: normalized.reasoning,
        mode: normalized.mode,
      },
    ]);

    return {
      result: statusText,
      progress: [],
      session: await getSession(projectId, sessionId),
      provider: 'system',
      fallbackUsed: false,
    };
  }

  const startedAt = Date.now();
  const abortController = typeof AbortController === 'function' ? new AbortController() : null;
  const jobId = startJob({
    type: 'session',
    projectId,
    sessionId,
    provider: normalized.provider,
    fallbackProvider,
    model: normalized.model || '',
    reasoning: normalized.reasoning,
    mode: normalized.mode,
    promptChars: normalized.prompt.length,
    cancel: (reason) => {
      if (abortController) {
        abortController.abort(reason);
      }
    },
  });

  logInfo('ask_session_start', {
    projectId,
    sessionId,
    provider: normalized.provider,
    fallbackProvider,
    model: normalized.model || '',
    reasoning: normalized.reasoning,
    mode: normalized.mode,
    promptChars: normalized.prompt.length,
  });

  let result;
  let usedProvider = normalized.provider;
  let progress = [];
  try {
    result = await providers[normalized.provider].ask(effectivePrompt, {
      cwd: project.projectPath,
      model: normalized.model,
      reasoning: normalized.reasoning,
      signal: abortController ? abortController.signal : undefined,
    });
  } catch (error) {
    if (error && error.isAbortError) {
      throw error;
    }
    if (fallbackProvider) {
      try {
        result = await providers[fallbackProvider].ask(effectivePrompt, {
          cwd: project.projectPath,
          model: normalized.model,
          reasoning: normalized.reasoning,
          signal: abortController ? abortController.signal : undefined,
        });
        usedProvider = fallbackProvider;
      } catch (fallbackError) {
        if (fallbackError && fallbackError.isAbortError) {
          throw fallbackError;
        }
        logError('ask_session_fallback_error', {
          projectId,
          sessionId,
          provider: fallbackProvider,
          durationMs: Date.now() - startedAt,
          details: fallbackError && fallbackError.details ? fallbackError.details : fallbackError?.message,
        });
        throw fallbackError;
      }
    } else {
      logError('ask_session_error', {
        projectId,
        sessionId,
        provider: normalized.provider,
        durationMs: Date.now() - startedAt,
        details: error && error.details ? error.details : error?.message,
      });
      throw error;
    }
  } finally {
    endJob(jobId);
  }

  const normalizedResult = normalizeProviderResult(result);
  const textResult = normalizedResult.text;
  progress = normalizedResult.progress;

  await appendMessages(projectId, sessionId, [
    {
      role: 'assistant',
      provider: usedProvider,
      content: textResult,
      model: normalized.model,
      reasoning: normalized.reasoning,
      mode: normalized.mode,
    },
  ]);

    return {
      result: textResult,
      progress,
      session: await getSession(projectId, sessionId),
      provider: usedProvider,
      fallbackUsed: usedProvider !== normalized.provider,
    };
  })();

  inflightSessionRequests.set(promptKey, requestPromise);
  try {
    return await requestPromise;
  } finally {
    if (inflightSessionRequests.get(promptKey) === requestPromise) {
      inflightSessionRequests.delete(promptKey);
    }
  }
}

module.exports = {
  askProvider,
  askInSession,
};
