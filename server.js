const express = require('express');
const path = require('path');

const apiRouter = require('./routes/api');
const { askProvider } = require('./services/chat-service');
const { AppError } = require('./services/errors');
const { ROOT_DIR } = require('./services/storage');
const { logInfo, logError } = require('./services/logger');

const app = express();
const port = 8000;
const publicDir = path.join(ROOT_DIR, 'public');

app.use(express.json());

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Backward-compatible endpoint from earlier implementation.
app.post('/ask', async (req, res) => {
  const payload = req.body || {};
  const provider = payload.provider;

  try {
    const result = await askProvider(payload);
    res.status(200).json({ result });
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.status).json({
        error: error.message,
        details: error.details,
      });
      return;
    }

    if (error && error.isAbortError) {
      res.status(409).json({
        error: 'Request aborted',
        details: error.message || 'Request aborted.',
      });
      return;
    }

    if (error && error.isCliError) {
      res.status(502).json({
        error: 'CLI provider execution failed',
        provider: provider || null,
        code: typeof error.code === 'number' ? error.code : null,
        details: error.details || 'Provider command failed.',
      });
      return;
    }

    console.error('Unexpected error:', error);
    logError('ask_error', { details: error && error.details ? error.details : error?.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.use('/api', apiRouter);
app.use(express.static(publicDir));

app.get('/', (_req, res) => {
  res.sendFile('index.html', { root: publicDir });
});

app.get('/settings', (_req, res) => {
  res.sendFile('settings.html', { root: publicDir });
});

app.use((error, _req, res, next) => {
  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    res.status(400).json({
      error: 'Validation error',
      details: 'Invalid JSON body.',
    });
    logError('invalid_json', { details: error.message });
    return;
  }

  next(error);
});

app.use((error, _req, res, _next) => {
  console.error('Unhandled error:', error);
  logError('unhandled_error', { details: error && error.details ? error.details : error?.message });
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(port, () => {
  console.log(`AI CLI Agent Server listening on port ${port}`);
  logInfo('server_start', { port });
});
