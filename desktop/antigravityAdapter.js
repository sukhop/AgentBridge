import { chromium } from 'playwright';
import { DesktopAutomation } from './automation.js';
import { FocusManager } from './focus.js';
import { WindowLocator } from './locator.js';

const APPROVAL_TERMS = [
  'allow',
  'run',
  'continue',
  'execute',
  'approve',
  'trust',
  'install package'
];

export function createAntigravityAdapter({ config, logger }) {
  const locator = new WindowLocator({ config, logger });
  const focusManager = new FocusManager({ config, logger, locator });
  const automation = new DesktopAutomation({ config, logger, focusManager, locator });
  return new AntigravityAdapter({ config, logger, automation, locator });
}

export class AntigravityAdapter {
  constructor({ config, logger, automation, locator }) {
    this.config = config;
    this.logger = logger;
    this.automation = automation;
    this.locator = locator;
    this.browser = null;
  }

  async focusAntigravity(session) {
    return this.automation.focusAntigravity(session);
  }

  async findPromptBox(session) {
    return this.automation.findPromptBox(session);
  }

  async typePrompt(session, text) {
    return this.automation.typePrompt(session, text);
  }

  async pressEnter() {
    return this.automation.pressEnter();
  }

  async clickApprove(session) {
    const cdpResult = await this.clickByText(session, APPROVAL_TERMS);
    if (cdpResult) return cdpResult;
    return this.automation.clickApprove(session);
  }

  async clickReject(session) {
    const cdpResult = await this.clickByText(session, ['cancel', 'reject', 'deny', 'stop']);
    if (cdpResult) return cdpResult;
    return this.automation.clickReject(session);
  }

  async captureWindow(session) {
    return this.automation.captureWindow(session);
  }

  async getCurrentWindow() {
    return this.locator.getCurrentWindow();
  }

  async copyTerminal(session) {
    return this.automation.copyTerminal(session);
  }

  async copyConversation(session) {
    return this.automation.copyConversation(session);
  }

  async getStatus(session) {
    let state = session.status;
    if (session.windowTitle) {
      if (/running|working|executing/i.test(session.windowTitle)) {
        state = 'Running';
      } else if (/paused|stopped/i.test(session.windowTitle)) {
        state = 'Stopped';
      } else if (/approval|confirm/i.test(session.windowTitle)) {
        state = 'Approval Required';
      } else if (/idle/i.test(session.windowTitle)) {
        state = 'Idle';
      }
    }
    return {
      detected: session.status !== 'Closed',
      windowTitle: session.windowTitle || '',
      processName: 'Antigravity',
      agentState: state
    };
  }

  async detectApprovalRequest(session) {
    const page = await this.getInspectablePage(session);
    if (!page) {
      if (session.windowTitle && /approval|confirm|allow|permit/i.test(session.windowTitle)) {
        return {
          required: true,
          title: 'Approval requested (detected from window title)',
          command: 'Confirm tool execution'
        };
      }
      return { required: false };
    }

    try {
      const text = (await page.locator('body').innerText({ timeout: 1000 })).toLowerCase();
      const foundTerm = APPROVAL_TERMS.find((term) => text.includes(term));
      if (!foundTerm) return { required: false };

      const command = extractCommand(text);
      return {
        required: true,
        title: `Approval keyword detected: ${foundTerm}`,
        command
      };
    } catch (error) {
      this.logger.debug('Approval detection through CDP failed', { message: error.message });
      return { required: false };
    }
  }

  async clickByText(session, terms) {
    const page = await this.getInspectablePage(session);
    if (!page) return null;

    for (const term of terms) {
      try {
        const locator = page.getByRole('button', { name: new RegExp(term, 'i') }).first();
        if (await locator.count()) {
          await locator.click({ timeout: 1500 });
          return { strategy: 'cdp', term };
        }
      } catch {
        // Keep scanning; UI labels differ across projects.
      }
    }

    return null;
  }

  async getInspectablePage(session) {
    if (!this.config.antigravity.cdpUrl) return null;

    try {
      if (!this.browser) {
        this.browser = await chromium.connectOverCDP(this.config.antigravity.cdpUrl);
      }
      const contexts = this.browser.contexts();
      const pages = contexts.flatMap((context) => context.pages());
      if (!pages.length) return null;

      // Try finding inspectable page by title or URL matching session metadata
      for (const page of pages) {
        const title = await page.title().catch(() => '');
        const url = page.url();
        const combined = `${title} ${url}`.toLowerCase();
        if (
          combined.includes(session.projectName.toLowerCase()) ||
          combined.includes(session.windowTitle.toLowerCase())
        ) {
          return page;
        }
      }

      return pages[0];
    } catch (error) {
      this.logger.debug('Could not connect to Antigravity CDP', { message: error.message });
      this.browser = null;
      return null;
    }
  }
}

function extractCommand(text) {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const commandLine = lines.find((line) => /npm|pnpm|yarn|node|powershell|cmd|git|install|run/.test(line));
  return commandLine ?? '';
}
