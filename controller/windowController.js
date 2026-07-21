export class WindowController {
  constructor({ adapter, logger }) {
    this.adapter = adapter;
    this.logger = logger;
  }

  async focus(session) {
    try {
      return await this.adapter.focusAntigravity(session);
    } catch (error) {
      this.logger.error('Window focus failed', { stack: error.stack });
      throw error;
    }
  }

  async current() {
    try {
      return await this.adapter.getCurrentWindow();
    } catch (error) {
      this.logger.error('Current window failed', { stack: error.stack });
      throw error;
    }
  }
}
