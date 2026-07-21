import fs from 'node:fs/promises';
import path from 'node:path';
import { load } from 'js-yaml';

export async function loadConfig(rootDir) {
  const configPath = path.join(rootDir, 'config.yaml');
  let fileConfig = {};
  try {
    const fileContent = await fs.readFile(configPath, 'utf8');
    fileConfig = load(fileContent) || {};
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn('Failed to parse config.yaml, using defaults/environment', error.message);
    }
  }

  const telegramToken = fileConfig.telegram?.botToken || process.env.TELEGRAM_BOT_TOKEN || '';
  const authorizedChatId = fileConfig.telegram?.authorizedChatId || process.env.AUTHORIZED_CHAT_ID || '';
  const port = fileConfig.server?.port || Number(process.env.PORT) || 3030;

  return {
    appName: 'AgentBridge',
    rootDir,
    telegram: {
      botToken: telegramToken,
      authorizedChatId: String(authorizedChatId),
      polling: fileConfig.telegram?.polling ?? true,
      debugAuth: fileConfig.telegram?.debugAuth ?? false
    },
    screenshotPath: path.resolve(rootDir, fileConfig.screenshotPath || 'screenshots'),
    logLevel: fileConfig.logLevel || 'info',
    deployCommand: fileConfig.deployCommand || '',
    server: {
      port,
      corsOrigin: fileConfig.server?.corsOrigin || '*'
    },
    monitor: {
      intervalMs: fileConfig.monitor?.intervalMs || 5000
    },
    antigravity: {
      windowHint: fileConfig.antigravity?.windowHint || 'Antigravity',
      cdpUrl: fileConfig.antigravity?.cdpUrl || '',
      promptShortcut: fileConfig.antigravity?.promptShortcut || 'Control+L',
      terminalShortcut: fileConfig.antigravity?.terminalShortcut || 'Control+`',
      conversationShortcut: fileConfig.antigravity?.conversationShortcut || 'Control+Shift+C',
      executablePath: fileConfig.antigravity?.executablePath || 'antigravity',
      fallbackCoordinates: {
        approveButton: parsePoint(fileConfig.antigravity?.fallbackCoordinates?.approveButton),
        rejectButton: parsePoint(fileConfig.antigravity?.fallbackCoordinates?.rejectButton),
        promptBox: parsePoint(fileConfig.antigravity?.fallbackCoordinates?.promptBox)
      }
    }
  };
}

function parsePoint(value) {
  if (!value) return null;
  if (typeof value === 'object' && typeof value.x === 'number' && typeof value.y === 'number') {
    return value;
  }
  const [x, y] = String(value).split(',').map((part) => Number(part.trim()));
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}
