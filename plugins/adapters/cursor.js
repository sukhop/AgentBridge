import { BaseAdapter } from '../../interfaces/adapter.js';
import { WindowLocator } from '../../desktop/locator.js';
import { FocusManager } from '../../desktop/focus.js';
import { DesktopAutomation } from '../../desktop/automation.js';

export default class CursorAdapterPlugin extends BaseAdapter {
  constructor({ config, logger }) {
    super({ config, logger });
    const localConfig = {
      ...config,
      antigravity: {
        ...config.antigravity,
        windowHint: 'Cursor',
        promptShortcut: 'Control+K'
      }
    };
    this.locator = new WindowLocator({ config: localConfig, logger });
    this.focusManager = new FocusManager({ config: localConfig, logger, locator: this.locator });
    this.automation = new DesktopAutomation({
      config: localConfig,
      logger,
      focusManager: this.focusManager,
      locator: this.locator
    });
  }

  async discoverWindows() {
    return this.locator.getAllAntigravityWindows();
  }

  async launch(projectPath) {
    const { spawn } = await import('node:child_process');
    const cp = spawn('cursor', [projectPath], { detached: true, stdio: 'ignore' });
    cp.unref();
  }

  async focus(session) {
    return this.automation.focusAntigravity(session);
  }

  async typePrompt(session, text) {
    return this.automation.typePrompt(session, text);
  }

  async pressEnter(session) {
    return this.automation.pressEnter(session);
  }

  async clickApprove(session) {
    return this.automation.clickApprove(session);
  }

  async clickReject(session) {
    return this.automation.clickReject(session);
  }

  async captureWindow(session) {
    return this.automation.captureWindow(session);
  }

  async getStatus(session) {
    return {
      detected: session.status !== 'Closed',
      windowTitle: session.windowTitle || '',
      processName: 'Cursor',
      agentState: session.status
    };
  }

  async detectApprovalRequest(session) {
    return { required: false };
  }

  async copyTerminal(session) {
    return this.automation.copyTerminal(session);
  }

  async copyConversation(session) {
    return this.automation.copyConversation(session);
  }
}
