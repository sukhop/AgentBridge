export class BaseMessenger {
  constructor({ config, logger, router }) {
    this.config = config;
    this.logger = logger;
    this.router = router;
  }

  async start() {
    throw new Error('Not implemented');
  }

  async stop() {
    throw new Error('Not implemented');
  }

  async sendNotification(event) {
    throw new Error('Not implemented');
  }

  async sendResponse(chatId, response) {
    throw new Error('Not implemented');
  }
}
