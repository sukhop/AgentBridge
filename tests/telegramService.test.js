import test from 'node:test';
import assert from 'node:assert/strict';
import { TelegramService } from '../services/telegramService.js';

const calls = {
  on: [],
  setMyCommands: [],
  sendMessage: [],
  sendPhoto: [],
  sendDocument: [],
  answerCallbackQuery: [],
  stopPolling: []
};

class MockTelegramBot {
  constructor(token, options) {
    this.token = token;
    this.options = options;
  }

  on(event, listener) {
    calls.on.push({ event, listener });
  }

  async setMyCommands(commands) {
    calls.setMyCommands.push(commands);
    return true;
  }

  async sendMessage(chatId, text, options) {
    calls.sendMessage.push({ chatId, text, options });
    return { message_id: 1 };
  }

  async sendPhoto(chatId, photo, options) {
    calls.sendPhoto.push({ chatId, photo, options });
    return { message_id: 2 };
  }

  async sendDocument(chatId, doc, options) {
    calls.sendDocument.push({ chatId, doc, options });
    return { message_id: 3 };
  }

  async answerCallbackQuery(queryId, options) {
    calls.answerCallbackQuery.push({ queryId, options });
    return true;
  }

  async stopPolling() {
    calls.stopPolling.push(true);
    return true;
  }
}

// Reset helper
function resetCalls() {
  calls.on = [];
  calls.setMyCommands = [];
  calls.sendMessage = [];
  calls.sendPhoto = [];
  calls.sendDocument = [];
  calls.answerCallbackQuery = [];
  calls.stopPolling = [];
}

// Config and logger mocks
const config = {
  rootDir: '.',
  telegram: {
    botToken: '123456:dummy_token',
    authorizedChatId: '123456789',
    polling: false,
    debugAuth: false
  }
};

const logger = {
  info() {},
  error() {},
  debug() {},
  warn() {}
};

const authService = {
  isAuthorized(msg) {
    const message = msg.message ?? msg;
    const id = message.chat?.id;
    return String(id) === '123456789';
  }
};

const router = {
  async handle({ text, sender }) {
    if (text === '/status' || text === 'status') {
      return { text: 'Running fine' };
    }
    if (text === '/screenshot') {
      return { text: 'Screenshot output', mediaPath: 'dummy.png' };
    }
    if (text === '/logs') {
      return { text: 'Logs attached', fileText: 'Log content...' };
    }
    return { text: `Processed: ${text}` };
  }
};

test('TelegramService starts and sets commands', async () => {
  resetCalls();
  const service = new TelegramService({ config, logger, authService, router, BotClass: MockTelegramBot });
  await service.start();

  assert.equal(service.isReady(), true);
  assert.ok(calls.on.length >= 3); // message, callback_query, polling_error
  assert.ok(calls.setMyCommands.length >= 1);

  await service.stop();
});

test('TelegramService processes messages from authorized chat', async () => {
  resetCalls();
  const service = new TelegramService({ config, logger, authService, router, BotClass: MockTelegramBot });
  await service.start();

  // Simulate incoming authorized message directly by calling handleMessage
  await service.handleMessage({
    chat: { id: 123456789 },
    text: '/status'
  });

  assert.equal(calls.sendMessage.length, 1);
  assert.equal(calls.sendMessage[0].chatId, 123456789);
  assert.match(calls.sendMessage[0].text, /Running fine/);

  await service.stop();
});

test('TelegramService ignores messages from unauthorized chat', async () => {
  resetCalls();
  const service = new TelegramService({ config, logger, authService, router, BotClass: MockTelegramBot });
  await service.start();

  // Simulate incoming unauthorized message directly
  await service.handleMessage({
    chat: { id: 999999999 },
    text: '/status'
  });

  assert.equal(calls.sendMessage.length, 0);

  await service.stop();
});

test('TelegramService routes callback queries', async () => {
  resetCalls();
  const service = new TelegramService({ config, logger, authService, router, BotClass: MockTelegramBot });
  await service.start();

  // Simulate incoming callback query directly by calling handleCallbackQuery
  await service.handleCallbackQuery({
    id: 'query_123',
    from: { id: 987654321 },
    data: 'status',
    message: {
      chat: { id: 123456789 },
      text: 'Original message'
    }
  });

  assert.equal(calls.answerCallbackQuery.length, 1);
  assert.equal(calls.answerCallbackQuery[0].queryId, 'query_123');
  assert.equal(calls.sendMessage.length, 1);
  assert.match(calls.sendMessage[0].text, /Running fine/);

  await service.stop();
});

test('TelegramService handles media sending', async () => {
  resetCalls();
  const service = new TelegramService({ config, logger, authService, router, BotClass: MockTelegramBot });
  await service.start();

  // Simulate incoming message directly
  await service.handleMessage({
    chat: { id: 123456789 },
    text: '/screenshot'
  });

  assert.equal(calls.sendPhoto.length, 1);
  assert.equal(calls.sendPhoto[0].chatId, 123456789);
  assert.equal(calls.sendPhoto[0].photo, 'dummy.png');

  await service.stop();
});

test('TelegramService prompts for setup if authorizedChatId is empty', async () => {
  resetCalls();
  const unconfiguredConfig = {
    ...config,
    telegram: {
      ...config.telegram,
      authorizedChatId: ''
    }
  };
  const service = new TelegramService({
    config: unconfiguredConfig,
    logger,
    authService,
    router,
    BotClass: MockTelegramBot
  });
  await service.start();

  const originalLog = console.log;
  let loggedOutput = '';
  console.log = (msg) => {
    loggedOutput += msg;
  };

  try {
    await service.handleMessage({
      chat: { id: 987654321 },
      text: '/status'
    });

    assert.equal(calls.sendMessage.length, 1);
    assert.equal(calls.sendMessage[0].chatId, 987654321);
    assert.match(calls.sendMessage[0].text, /Your Chat ID is/);
    assert.match(loggedOutput, /987654321/);
  } finally {
    console.log = originalLog;
    await service.stop();
  }
});
