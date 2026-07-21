import { BaseAdapter } from '../../interfaces/adapter.js';
import { createAntigravityAdapter } from '../../desktop/antigravityAdapter.js';

export default class AntigravityAdapterPlugin extends BaseAdapter {
  constructor({ config, logger }) {
    super({ config, logger });
    this.impl = createAntigravityAdapter({ config, logger });
  }

  async discoverWindows() {
    return this.impl.locator.getAllAntigravityWindows();
  }

  async launch(projectPath) {
    const executable = this.config.antigravity?.executablePath || 'antigravity';
    const { spawn } = await import('node:child_process');
    const cp = spawn(executable, [projectPath], { detached: true, stdio: 'ignore' });
    cp.unref();
  }

  async focus(session) {
    return this.impl.focusAntigravity(session);
  }

  async typePrompt(session, text) {
    return this.impl.typePrompt(session, text);
  }

  async pressEnter() {
    return this.impl.pressEnter();
  }

  async clickApprove(session) {
    return this.impl.clickApprove(session);
  }

  async clickReject(session) {
    return this.impl.clickReject(session);
  }

  async captureWindow(session) {
    return this.impl.captureWindow(session);
  }

  async getStatus(session) {
    return this.impl.getStatus(session);
  }

  async detectApprovalRequest(session) {
    return this.impl.detectApprovalRequest(session);
  }

  async copyTerminal(session) {
    return this.impl.copyTerminal(session);
  }

  async copyConversation(session) {
    return this.impl.copyConversation(session);
  }
}
