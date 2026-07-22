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
    const args = [projectPath];

    // Antigravity is a single shared Electron process for all open windows,
    // so this flag only takes effect on the *first* window opened after a
    // full quit - it's a no-op while an instance without it is still running.
    const port = extractCdpPort(this.config.antigravity?.cdpUrl);
    if (port) args.push(`--remote-debugging-port=${port}`);

    const cp = spawn(executable, args, { detached: true, stdio: 'ignore' });
    cp.unref();
  }

  async focus(session) {
    return this.impl.focusAntigravity(session);
  }

  async typePrompt(session, text) {
    return this.impl.typePrompt(session, text);
  }

  async pressEnter(session) {
    return this.impl.pressEnter(session);
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

function extractCdpPort(cdpUrl) {
  if (!cdpUrl) return null;
  try {
    return new URL(cdpUrl).port || null;
  } catch {
    return null;
  }
}
