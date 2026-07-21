export class MouseController {
  constructor({ adapter, logger }) {
    this.adapter = adapter;
    this.logger = logger;
  }

  async approve(session) {
    try {
      return await this.adapter.clickApprove(session);
    } catch (error) {
      this.logger.error('Mouse approve failed', { stack: error.stack });
      throw error;
    }
  }

  async reject(session) {
    try {
      return await this.adapter.clickReject(session);
    } catch (error) {
      this.logger.error('Mouse reject failed', { stack: error.stack });
      throw error;
    }
  }
}
