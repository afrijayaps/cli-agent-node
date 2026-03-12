const { AppError } = require('./errors');
const { providers, isValidProvider, DEFAULT_PROVIDER } = require('../providers');
const { appendMessages, getSession, getProject } = require('./project-service');

function validateAskPayload({ provider, prompt }) {
  const normalizedProvider =
    typeof provider === 'string' && provider.trim().length > 0 ? provider.trim() : DEFAULT_PROVIDER;

  if (!isValidProvider(normalizedProvider)) {
    throw new AppError(400, 'Validation error', 'provider must be one of: codex, claude, antigravity, ollama.');
  }

  if (typeof prompt !== 'string' || prompt.trim().length === 0) {
    throw new AppError(400, 'Validation error', 'prompt must be a non-empty string.');
  }

  return {
    provider: normalizedProvider,
    prompt,
  };
}

async function askProvider({ provider, prompt }) {
  const normalized = validateAskPayload({ provider, prompt });
  return providers[normalized.provider].ask(normalized.prompt);
}

async function askInSession({ projectId, sessionId, provider, prompt }) {
  const normalized = validateAskPayload({ provider, prompt });
  const project = await getProject(projectId);

  await appendMessages(projectId, sessionId, [
    {
      role: 'user',
      provider: normalized.provider,
      content: normalized.prompt,
    },
  ]);

  let result;
  try {
    result = await providers[normalized.provider].ask(normalized.prompt, {
      cwd: project.projectPath,
    });
  } catch (error) {
    throw error;
  }

  await appendMessages(projectId, sessionId, [
    {
      role: 'assistant',
      provider: normalized.provider,
      content: result,
    },
  ]);

  return {
    result,
    session: await getSession(projectId, sessionId),
  };
}

module.exports = {
  askProvider,
  askInSession,
};
