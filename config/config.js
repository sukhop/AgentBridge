import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

function env(name, fallback = '') {
  return process.env[name] ?? fallback;
}

function envNumber(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function envBoolean(name, fallback = false) {
  const value = process.env[name];
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function resolveFromRoot(value) {
  return path.isAbsolute(value) ? value : path.join(rootDir, value);
}

export function loadConfig() {
  const screenshotPath = resolveFromRoot(env('SCREENSHOT_PATH', 'screenshots'));

  return {
    appName: 'AGRemote',
    rootDir,
    telegram: {
      botToken: env('TELEGRAM_BOT_TOKEN'),
      authorizedChatId: env('AUTHORIZED_CHAT_ID'),
      polling: envBoolean('TELEGRAM_POLLING', true),
      debugAuth: envBoolean('DEBUG_AUTH', false)
    },
    screenshotPath,
    logLevel: env('LOG_LEVEL', 'info'),
    deployCommand: env('DEPLOY_COMMAND', ''),
    server: {
      port: envNumber('PORT', 3030),
      corsOrigin: env('CORS_ORIGIN', '*')
    },
    monitor: {
      intervalMs: envNumber('MONITOR_INTERVAL_MS', 5000),
      progressIntervalMs: envNumber('PROGRESS_INTERVAL_MS', 30000)
    },
    antigravity: {
      windowHint: env('ANTIGRAVITY_WINDOW_HINT', 'Antigravity'),
      cdpUrl: env('ANTIGRAVITY_CDP_URL', ''),
      promptShortcut: env('PROMPT_SHORTCUT', 'Control+L'),
      terminalShortcut: env('TERMINAL_SHORTCUT', 'Control+`'),
      conversationShortcut: env('CONVERSATION_SHORTCUT', 'Control+Shift+C'),
      fallbackCoordinates: {
        approveButton: parsePoint(env('APPROVE_BUTTON_POINT', '')),
        rejectButton: parsePoint(env('REJECT_BUTTON_POINT', '')),
        promptBox: parsePoint(env('PROMPT_BOX_POINT', ''))
      }
    }
  };
}

function parsePoint(value) {
  if (!value) return null;
  const [x, y] = value.split(',').map((part) => Number(part.trim()));
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}
