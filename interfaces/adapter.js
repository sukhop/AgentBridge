export class BaseAdapter {
  constructor({ config, logger }) {
    this.config = config;
    this.logger = logger;
  }

  async focus(session) {
    throw new Error('Not implemented');
  }

  async typePrompt(session, text) {
    throw new Error('Not implemented');
  }

  async pressEnter() {
    throw new Error('Not implemented');
  }

  async clickApprove(session) {
    throw new Error('Not implemented');
  }

  async clickReject(session) {
    throw new Error('Not implemented');
  }

  async captureWindow(session) {
    throw new Error('Not implemented');
  }

  async getStatus(session) {
    throw new Error('Not implemented');
  }

  async detectApprovalRequest(session) {
    throw new Error('Not implemented');
  }

  async copyTerminal(session) {
    throw new Error('Not implemented');
  }

  async copyConversation(session) {
    throw new Error('Not implemented');
  }
}
