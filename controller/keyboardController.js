export class KeyboardController {
  constructor({ adapter, logger }) {
    this.adapter = adapter;
    this.logger = logger;
  }

  async typePrompt(session, text) {
    try {
      await this.adapter.typePrompt(session, text);
    } catch (error) {
      this.logger.error('Keyboard typePrompt failed', { stack: error.stack });
      throw error;
    }
  }

  async pressEnter() {
    try {
      await this.adapter.pressEnter();
    } catch (error) {
      this.logger.error('Keyboard pressEnter failed', { stack: error.stack });
      throw error;
    }
  }
}
