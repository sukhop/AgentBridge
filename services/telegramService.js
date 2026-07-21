import fs from 'node:fs/promises';
import path from 'node:path';
import TelegramBot from 'node-telegram-bot-api';

const CALLBACK_COMMANDS = new Map([
  ['approve', '/approve'],
  ['reject', '/reject'],
  ['screenshot', '/screenshot'],
  ['status', '/status'],
  ['stop', '/stop'],
  ['resume', '/resume'],
  ['sessions', '/sessions']
]);

export class TelegramService {
  constructor({ config, logger, authService, router, sessionManager, notificationService, BotClass = TelegramBot }) {
    this.config = config;
    this.logger = logger;
    this.authService = authService;
    this.router = router;
    this.sessionManager = sessionManager;
    this.notificationService = notificationService;
    this.BotClass = BotClass;
    this.bot = null;
    this.ready = false;
    this.authorizedChatId = config.telegram.authorizedChatId;
    this.logger.debug('TelegramService instantiated', { authorizedChatId: this.authorizedChatId });
  }

  async start() {
    this.logger.debug('TelegramService starting...');
    console.log("BOT TOKEN:", this.config.telegram.botToken);
    console.log("AUTHORIZED_CHAT_ID:", this.config.telegram.authorizedChatId);

    if (!this.config.telegram.botToken) {
      const error = new Error('TELEGRAM_BOT_TOKEN is not configured.');
      error.expose = true;
      throw error;
    }

    this.bot = new this.BotClass(this.config.telegram.botToken, {
      polling: this.config.telegram.polling
    });

    this.bot.on('message', (message) => {
      this.logger.debug('Telegram Bot event message received', { chatId: message.chat?.id, text: message.text });
      this.handleMessage(message).catch((error) => {
        this.logger.error('Telegram message handler failed', { stack: error.stack });
      });
    });

    this.bot.on('callback_query', (query) => {
      this.logger.debug('Telegram Bot event callback_query received', { id: query.id, data: query.data });
      this.handleCallbackQuery(query).catch((error) => {
        this.logger.error('Telegram callback handler failed', { stack: error.stack });
      });
    });

    this.bot.on('polling_error', (error) => {
      this.logger.error('Telegram polling error', { message: error.message, code: error.code });
    });

    await this.setCommands();
    this.ready = true;
    this.logger.info('Telegram bot is ready', { polling: this.config.telegram.polling });
  }

  async stop() {
    if (!this.bot) return;
    if (this.config.telegram.polling) {
      await this.bot.stopPolling();
    }
    this.ready = false;
  }

  isReady() {
    return this.ready;
  }

  async handleMessage(message) {
    const chatId = message.chat?.id;
    const authorizedChatId = this.authorizedChatId?.trim();

    if (!authorizedChatId && chatId) {
      console.log(`
================================
Your Telegram Chat ID:

${chatId}

Copy this into your .env file:

AUTHORIZED_CHAT_ID=${chatId}

================================
      `);

      await this.bot.sendMessage(
        chatId,
        `✅ Your Chat ID is:\n\n${chatId}\n\nAdd this to your .env:\nAUTHORIZED_CHAT_ID=${chatId}\n\nRestart the bot afterwards.`
      );
      return;
    }

    if (!this.authService.isAuthorized(message)) return;

    const text = message.text?.trim();
    if (!text) {
      await this.bot.sendMessage(message.chat.id, 'Send /help for available commands.');
      return;
    }

    console.log(`\n--- Received update: "${text}" from Chat ${message.chat.id} ---`);
    const parsed = this.router.parser ? this.router.parser.parse(text) : { name: text.startsWith('/') ? text.split(/\s+/)[0].replace(/^\//, '').split('@')[0].toLowerCase() : 'prompt' };
    console.log(`Parsed command: ${parsed.name}`);
    const handler = this.router.handlers ? this.router.handlers.get(parsed.name) : null;
    console.log(`Selected handler: ${handler ? handler.name : 'none'}`);

    const activeSession = this.sessionManager ? this.sessionManager.getActiveSession() : null;
    console.log(`Session ID: ${activeSession ? activeSession.id : 'none'}`);
    console.log(`Workspace: ${activeSession ? activeSession.projectName : 'none'}`);

    const response = await this.router.handle({
      text,
      sender: String(message.chat.id),
      meta: { telegramMessage: message }
    });
    await this.sendResponse(message.chat.id, response);
    console.log('Telegram response sent\n');
  }

  async handleCallbackQuery(query) {
    if (!this.authService.isAuthorized(query)) {
      await this.bot.answerCallbackQuery(query.id, { text: 'Not authorized.' });
      return;
    }

    let data = query.data;
    let sessionId = '';
    if (data.includes(':')) {
      const parts = data.split(':');
      data = parts[0];
      sessionId = parts[1];
    }

    const chatId = query.message.chat.id;

    if (data === 'activate') {
      try {
        await this.sessionManager.setActiveSession(sessionId);
        const name = this.sessionManager.getActiveSession()?.projectName || 'unknown';
        await this.bot.answerCallbackQuery(query.id, { text: `Activated project: ${name}` });
        await this.sendResponse(chatId, { text: `🟢 Active project is now: ${name}` });
      } catch (err) {
        await this.bot.answerCallbackQuery(query.id, { text: err.message });
      }
      return;
    }

    const baseCommand = CALLBACK_COMMANDS.get(data);
    if (!baseCommand) {
      await this.bot.answerCallbackQuery(query.id, { text: 'Unknown action.' });
      return;
    }

    await this.bot.answerCallbackQuery(query.id);
    const commandText = sessionId ? `${baseCommand} ${sessionId}` : baseCommand;

    console.log(`\n--- Received update (Callback Button): "${query.data}" from Chat ${chatId} ---`);
    const parsed = this.router.parser ? this.router.parser.parse(commandText) : { name: commandText.split(' ')[0] };
    console.log(`Parsed command: ${parsed.name}`);
    const handler = this.router.handlers ? this.router.handlers.get(parsed.name) : null;
    console.log(`Selected handler: ${handler ? handler.name : 'none'}`);
    console.log(`Session ID: ${sessionId || 'none'}`);

    const targetSession = this.sessionManager ? ((this.sessionManager.sessions ? this.sessionManager.sessions.get(sessionId) : null) || this.sessionManager.getActiveSession()) : null;
    console.log(`Workspace: ${targetSession ? targetSession.projectName : 'none'}`);

    const response = await this.router.handle({
      text: commandText,
      sender: String(chatId),
      meta: { telegramCallbackQuery: query }
    });
    await this.sendResponse(chatId, response);
    console.log('Telegram response sent\n');
  }

  async sendNotification(event) {
    this.logger.debug('TelegramService received notification event', { type: event.type });
    if (!this.ready || !this.authorizedChatId) {
      this.logger.debug('Skipped notification because Telegram is not ready or AUTHORIZED_CHAT_ID is missing');
      return;
    }

    this.logger.debug('TelegramService dispatching notification to user', { chatId: this.authorizedChatId, text: event.text });

    console.log(`[DIAGNOSTICS] Telegram sendMessage invoked for event type: ${event.type}`);

    let p;
    if (event.type === 'approval-required' && event.session) {
      const keyboard = {
        reply_markup: {
          inline_keyboard: [
            [
              { text: 'Approve', callback_data: `approve:${event.session.id}` },
              { text: 'Reject', callback_data: `reject:${event.session.id}` }
            ],
            [
              { text: 'Screenshot', callback_data: `screenshot:${event.session.id}` },
              { text: 'Status', callback_data: `status:${event.session.id}` }
            ]
          ]
        }
      };
      p = this.bot.sendMessage(this.authorizedChatId, event.text, keyboard);
    } else {
      p = this.bot.sendMessage(this.authorizedChatId, event.text);
    }

    try {
      const res = await p;
      console.log(`[DIAGNOSTICS] Telegram API response received: SUCCESS (Message ID: ${res.message_id})\n`);
    } catch (err) {
      console.log(`[DIAGNOSTICS] Telegram API response received: FAILED (${err.message})\n`);
      throw err;
    }
  }

  async sendResponse(chatId, response) {
    const text = response.text ?? 'Done.';

    const replyMarkup = response.reply_markup
      ? { reply_markup: response.reply_markup }
      : mainKeyboardOptions();

    if (response.mediaPath) {
      await this.bot.sendPhoto(chatId, response.mediaPath, {
        caption: text,
        ...replyMarkup
      });
      return;
    }

    if (response.filePath) {
      await this.bot.sendDocument(chatId, response.filePath, {
        caption: text
      });
      return;
    }

    if (response.fileText) {
      const filePath = await this.writeTempTextFile(response.fileName ?? 'agremote-output.txt', response.fileText);
      await this.bot.sendDocument(chatId, filePath, {
        caption: text
      });
      return;
    }

    await this.bot.sendMessage(chatId, formatTelegramText(text), {
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      ...replyMarkup
    });
  }

  async writeTempTextFile(fileName, content) {
    const safeName = fileName.replace(/[^a-z0-9_.-]/gi, '_');
    const filePath = path.join(this.config.rootDir, 'storage', `${Date.now()}-${safeName}`);
    await fs.writeFile(filePath, content);
    return filePath;
  }

  async setCommands() {
    await this.bot.setMyCommands([
      { command: 'start', description: 'Start AGRemote' },
      { command: 'help', description: 'Show commands' },
      { command: 'status', description: 'Show Antigravity status' },
      { command: 'prompt', description: 'Send a prompt to Antigravity' },
      { command: 'screenshot', description: 'Capture Antigravity' },
      { command: 'approve', description: 'Approve current request' },
      { command: 'reject', description: 'Reject current request' },
      { command: 'terminal', description: 'Read terminal output' },
      { command: 'logs', description: 'Read latest AGRemote logs' },
      { command: 'history', description: 'Read conversation history' },
      { command: 'stop', description: 'Stop agent' },
      { command: 'resume', description: 'Resume agent' },
      { command: 'restart', description: 'Restart agent' },
      { command: 'commit', description: 'Commit repo changes' },
      { command: 'push', description: 'Push current branch' },
      { command: 'deploy', description: 'Run configured deploy command' },
      { command: 'branch', description: 'Show current branch' },
      { command: 'sessions', description: 'List active project sessions' },
      { command: 'projects', description: 'List registered workspaces and status' },
      { command: 'use', description: 'Switch active workspace project' },
      { command: 'open', description: 'Open and register a project' }
    ]);
  }
}

export function mainKeyboardOptions() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: 'Approve', callback_data: 'approve' },
          { text: 'Reject', callback_data: 'reject' }
        ],
        [
          { text: 'Screenshot', callback_data: 'screenshot' },
          { text: 'Status', callback_data: 'status' }
        ],
        [
          { text: 'Stop', callback_data: 'stop' },
          { text: 'Resume', callback_data: 'resume' }
        ],
        [
          { text: 'Projects', callback_data: 'sessions' }
        ]
      ]
    }
  };
}

export function approvalKeyboardOptions() {
  return mainKeyboardOptions();
}

function formatTelegramText(text) {
  if (text.length > 3900) {
    return escapeHtml(`${text.slice(0, 3900)}\n\n[truncated]`);
  }
  return escapeHtml(text);
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
