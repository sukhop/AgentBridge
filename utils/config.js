import fs from 'node:fs/promises';
import path from 'node:path';
import { load } from 'js-yaml';

function envBoolean(value, fallback = false) {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

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

  // Environment variables always take priority over config.yaml values.
  // config.yaml is for non-secret settings; secrets live in .env.
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN || fileConfig.telegram?.botToken || '';
  const authorizedChatId = process.env.AUTHORIZED_CHAT_ID || fileConfig.telegram?.authorizedChatId || '';
  const port = Number(process.env.PORT) || fileConfig.server?.port || 3030;

  // Messengers: `enabled` is a non-secret toggle (config.yaml or env);
  // tokens/ids are secrets and only ever come from .env.
  const messengersFileConfig = fileConfig.messengers || {};
  const telegramMessengerEnabled = process.env.MESSENGER_TELEGRAM_ENABLED !== undefined
    ? envBoolean(process.env.MESSENGER_TELEGRAM_ENABLED)
    : (messengersFileConfig.telegram?.enabled ?? true);
  const discordMessengerEnabled = process.env.MESSENGER_DISCORD_ENABLED !== undefined
    ? envBoolean(process.env.MESSENGER_DISCORD_ENABLED)
    : (messengersFileConfig.discord?.enabled ?? false);

  return {
    appName: 'AgentBridge',
    rootDir,
    workspaces: fileConfig.workspaces || [],
    telegram: {
      botToken: telegramToken,
      authorizedChatId: String(authorizedChatId),
      polling: fileConfig.telegram?.polling ?? true,
      debugAuth: fileConfig.telegram?.debugAuth ?? false
    },
    messengers: {
      telegram: {
        enabled: telegramMessengerEnabled,
        botToken: telegramToken,
        chatId: String(authorizedChatId)
      },
      discord: {
        enabled: discordMessengerEnabled,
        botToken: process.env.DISCORD_BOT_TOKEN || '',
        guildId: process.env.DISCORD_GUILD_ID || '',
        channelId: process.env.DISCORD_CHANNEL_ID || ''
      }
    },
    screenshotPath: path.resolve(rootDir, fileConfig.screenshotPath || 'screenshots'),
    logLevel: fileConfig.logLevel || 'info',
    deployCommand: fileConfig.deployCommand || '',
    server: {
      port,
      corsOrigin: fileConfig.server?.corsOrigin || '*'
    },
    monitor: {
      intervalMs: fileConfig.monitor?.intervalMs || 5000,
      progressIntervalMs: Number(process.env.PROGRESS_INTERVAL_MS) || fileConfig.monitor?.progressIntervalMs || 30000
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
