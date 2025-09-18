import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const STORAGE_MODES = {
  GLOBAL: 'global',
  PROJECT: 'project'
};

const APP_DIR = path.join(os.homedir(), '.ink-notex');
const CONFIG_PATH = path.join(APP_DIR, 'config.json');
const GLOBAL_TODOS_PATH = path.join(APP_DIR, 'todos.json');
const PROJECT_TODOS_PATH = path.join(process.cwd(), '.ink-notex-todos.json');

const EMPTY_RESULT = {items: [], error: null};

function ensureDir(dirPath) {
  try {
    fs.mkdirSync(dirPath, {recursive: true});
  } catch (error) {
    // Directory creation errors will be surfaced on write when relevant
  }
}

export function readConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    return {};
  }
}

export function writeConfig(config) {
  try {
    ensureDir(APP_DIR);
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
    return null;
  } catch (error) {
    return error;
  }
}

export function detectDefaultStorageMode() {
  const config = readConfig();
  if (config.storageMode && Object.values(STORAGE_MODES).includes(config.storageMode)) {
    return config.storageMode;
  }

  if (fs.existsSync(PROJECT_TODOS_PATH)) {
    return STORAGE_MODES.PROJECT;
  }

  return STORAGE_MODES.GLOBAL;
}

export function getTodosPath(mode) {
  return mode === STORAGE_MODES.PROJECT ? PROJECT_TODOS_PATH : GLOBAL_TODOS_PATH;
}

export function loadTodos(mode) {
  const targetPath = getTodosPath(mode);
  try {
    const raw = fs.readFileSync(targetPath, 'utf8');
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return {items: [], error: new Error('Invalid data format')};
    }

    return {items: parsed, error: null};
  } catch (error) {
    if (error.code === 'ENOENT') {
      return EMPTY_RESULT;
    }

    return {items: [], error};
  }
}

export function saveTodos(mode, todos) {
  const targetPath = getTodosPath(mode);
  const dir = path.dirname(targetPath);

  ensureDir(dir);

  try {
    fs.writeFileSync(targetPath, JSON.stringify(todos, null, 2), 'utf8');
    return null;
  } catch (error) {
    return error;
  }
}
