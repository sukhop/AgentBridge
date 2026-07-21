import { BaseMessenger } from '../../interfaces/messenger.js';
import { TelegramService } from '../../services/telegramService.js';

export default class TelegramMessengerPlugin extends BaseMessenger {
  constructor(opts) {
    super(opts);
    this.impl = new TelegramService(opts);
  }

  async start() {
    return this.impl.start();
  }

  async stop() {
    return this.impl.stop();
  }

  async sendNotification(event) {
    return this.impl.sendNotification(event);
  }

  async sendResponse(chatId, response) {
    return this.impl.sendResponse(chatId, response);
  }
}
