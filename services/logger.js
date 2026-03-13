const { DATA_DIR, ensureDir, fs, path } = require('./storage');

const LOG_DIR = path.join(DATA_DIR, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'app.log');

function safeMeta(meta) {
  if (!meta || typeof meta !== 'object') {
    return {};
  }

  const out = {};
  for (const [key, value] of Object.entries(meta)) {
    if (value === null || value === undefined) {
      continue;
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value;
      continue;
    }
    try {
      out[key] = JSON.stringify(value).slice(0, 500);
    } catch (_error) {
      // skip unserializable values
    }
  }
  return out;
}

async function appendLog(level, message, meta) {
  try {
    await ensureDir(LOG_DIR);
    const payload = {
      ts: new Date().toISOString(),
      level,
      message,
      ...safeMeta(meta),
    };
    await fs.appendFile(LOG_FILE, `${JSON.stringify(payload)}\n`, 'utf8');
  } catch (_error) {
    // Avoid crashing the app because of logging failures.
  }
}

function logInfo(message, meta) {
  appendLog('info', message, meta);
}

function logWarn(message, meta) {
  appendLog('warn', message, meta);
}

function logError(message, meta) {
  appendLog('error', message, meta);
}

module.exports = {
  LOG_FILE,
  logInfo,
  logWarn,
  logError,
};
