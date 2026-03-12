const fs = require('fs/promises');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const PROJECTS_DIR = path.join(DATA_DIR, 'projects');
const SETTINGS_FILE = path.join(DATA_DIR, 'app-settings.json');

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (_error) {
    return false;
  }
}

async function readJson(filePath, fallback = null) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return fallback;
    }

    throw error;
  }
}

async function writeJson(filePath, data) {
  const dirName = path.dirname(filePath);
  await ensureDir(dirName);
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

module.exports = {
  ROOT_DIR,
  DATA_DIR,
  PROJECTS_DIR,
  SETTINGS_FILE,
  ensureDir,
  fileExists,
  readJson,
  writeJson,
  fs,
  path,
};
