import { BaseMessenger } from '../../interfaces/messenger.js';
import { TelegramService, formatTelegramText } from '../../services/telegramService.js';

// Telegram's own polling/routing loop (TelegramService) already owns the
// full command lifecycle - parsing, authorization, dispatching to the
// CommandRouter, and replying - and that flow is stable and tested. This
// wrapper adapts that working implementation onto the shared Messenger
// interface at the boundary, rather than tearing it apart to force every
// internal step through the generic interface methods.
export default class TelegramMessengerPlugin extends BaseMessenger {
  constructor(opts) {
    super(opts);
    this.impl = new TelegramService(opts);
  }

  async connect() {
    return this.impl.start();
  }

  async disconnect() {
    return this.impl.stop();
  }

  async sendMessage(target, content) {
    const chatId = this.resolveChatId(target);
    const text = typeof content === 'string' ? content : content.text;
    const res = await this.impl.bot.sendMessage(chatId, formatTelegramText(text), {
      parse_mode: 'HTML',
      disable_web_page_preview: true
    });
    return { messageId: res.message_id };
  }

  async editMessage(target, messageId, content) {
    const chatId = this.resolveChatId(target);
    const text = typeof content === 'string' ? content : content.text;
    await this.impl.bot.editMessageText(formatTelegramText(text), {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'HTML',
      disable_web_page_preview: true
    });
  }

  async sendImage(target, imagePath, caption) {
    const chatId = this.resolveChatId(target);
    const res = await this.impl.bot.sendPhoto(chatId, imagePath, { caption });
    return { messageId: res.message_id };
  }

  async sendFile(target, filePath, caption) {
    const chatId = this.resolveChatId(target);
    const res = await this.impl.bot.sendDocument(chatId, filePath, { caption });
    return { messageId: res.message_id };
  }

  async sendButtons(target, content, buttons) {
    const chatId = this.resolveChatId(target);
    const text = typeof content === 'string' ? content : content.text;
    const inline_keyboard = buttons.map((row) => row.map((b) => ({ text: b.label, callback_data: b.action })));
    const res = await this.impl.bot.sendMessage(chatId, formatTelegramText(text), {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard }
    });
    return { messageId: res.message_id };
  }

  async sendSelectMenu(target, content, options, placeholder) {
    // Telegram has no native dropdown component - render as a single-column
    // button stack instead, which behaves the same from the user's side.
    const buttons = options.map((opt) => [{ label: opt.label, action: opt.value }]);
    const text = typeof content === 'string' ? content : content.text;
    return this.sendButtons(target, placeholder ? `${text}\n\n${placeholder}` : text, buttons);
  }

  async registerCommands(commands) {
    await this.impl.bot.setMyCommands(commands.map((c) => ({ command: c.name, description: c.description })));
  }

  // TelegramService already routes every incoming message/callback through
  // this.router internally, so there's no separate input stream to attach a
  // generic handler to. Kept as a real (non-throwing) implementation for
  // interface conformance and so a future central dispatcher has a hook.
  receiveCommands(handler) {
    this.impl.externalCommandHandler = handler;
  }

  async notify(event) {
    return this.impl.sendNotification(event);
  }

  resolveChatId(target) {
    return target?.channelId ?? this.config.telegram.authorizedChatId;
  }

  // --- Backward-compatible aliases for the pre-redesign API surface ---
  async start() {
    return this.connect();
  }

  async stop() {
    return this.disconnect();
  }

  async sendNotification(event) {
    return this.notify(event);
  }

  async sendResponse(chatId, response) {
    return this.impl.sendResponse(chatId, response);
  }
}
