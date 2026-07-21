export class AuthService {
  constructor({ config, logger }) {
    this.authorizedChatId = normalizeChatId(config.telegram.authorizedChatId);
    this.debug = config.telegram.debugAuth;
    this.logger = logger;
  }

  isAuthorized(messageOrCallback = {}) {
    const context = getTelegramAuthContext(messageOrCallback);
    const passed = Boolean(
      this.authorizedChatId &&
      context.chatId &&
      normalizeChatId(context.chatId) === this.authorizedChatId
    );

    if (this.debug) {
      this.logger.info('Telegram authorization debug', {
        rawChatId: context.chatId,
        normalizedChatId: normalizeChatId(context.chatId),
        authorizedChatId: this.authorizedChatId,
        fromUserId: context.fromUserId,
        messageType: context.messageType,
        authorizationPassed: passed
      });
    }

    if (!passed) {
      this.logger.warn('Ignored unauthorized Telegram message', {
        incomingChatId: context.chatId,
        configuredChatId: this.authorizedChatId || '(missing)',
        fromUserId: context.fromUserId,
        messageType: context.messageType,
        reason: this.authorizedChatId
          ? 'Chat ID does not match AUTHORIZED_CHAT_ID.'
          : 'AUTHORIZED_CHAT_ID is not configured.'
      });
    }

    return passed;
  }
}

export function normalizeChatId(value = '') {
  return String(value).trim();
}

export function getTelegramAuthContext(messageOrCallback = {}) {
  const message = messageOrCallback.message ?? messageOrCallback;
  return {
    chatId: message.chat?.id ?? message.chat?.username ?? '',
    fromUserId: messageOrCallback.from?.id ?? message.from?.id ?? '',
    messageType: messageOrCallback.data ? 'callback_query' : inferMessageType(message)
  };
}

function inferMessageType(message = {}) {
  if (message.text) return 'text';
  if (message.photo) return 'photo';
  if (message.document) return 'document';
  return 'unknown';
}
