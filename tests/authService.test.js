import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AuthService,
  normalizeChatId,
  getTelegramAuthContext
} from '../services/authService.js';

const logger = {
  info() {},
  warn() {}
};

test('normalizes chat IDs', () => {
  assert.equal(normalizeChatId(' 123456789 '), '123456789');
  assert.equal(normalizeChatId(123456789), '123456789');
  assert.equal(normalizeChatId(''), '');
});

test('extracts telegram auth context from private message', () => {
  const message = {
    chat: { id: 123456789, username: 'testuser' },
    from: { id: 987654321 },
    text: 'Hello'
  };
  const context = getTelegramAuthContext(message);

  assert.equal(context.chatId, 123456789);
  assert.equal(context.fromUserId, 987654321);
  assert.equal(context.messageType, 'text');
});

test('extracts telegram auth context from callback query', () => {
  const query = {
    id: 'query_id',
    from: { id: 987654321 },
    data: 'approve',
    message: {
      chat: { id: 123456789 },
      text: 'Original message'
    }
  };
  const context = getTelegramAuthContext(query);

  assert.equal(context.chatId, 123456789);
  assert.equal(context.fromUserId, 987654321);
  assert.equal(context.messageType, 'callback_query');
});

test('authorizes message from authorized chat ID', () => {
  const authService = new AuthService({
    config: {
      telegram: {
        authorizedChatId: '123456789',
        debugAuth: false
      }
    },
    logger
  });

  const message = {
    chat: { id: 123456789 },
    text: '/status'
  };

  assert.equal(authService.isAuthorized(message), true);
});

test('rejects message from unauthorized chat ID', () => {
  const authService = new AuthService({
    config: {
      telegram: {
        authorizedChatId: '123456789',
        debugAuth: false
      }
    },
    logger
  });

  const message = {
    chat: { id: 999999999 },
    text: '/status'
  };

  assert.equal(authService.isAuthorized(message), false);
});

test('rejects when authorizedChatId is empty', () => {
  const authService = new AuthService({
    config: {
      telegram: {
        authorizedChatId: '',
        debugAuth: false
      }
    },
    logger
  });

  const message = {
    chat: { id: 123456789 },
    text: '/status'
  };

  assert.equal(authService.isAuthorized(message), false);
});
