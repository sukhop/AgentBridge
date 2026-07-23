import fs from 'node:fs/promises';
import path from 'node:path';
import { readClipboard, writeClipboard } from '../utils/clipboard.js';

const keyAliases = {
  Control: 'LeftControl',
  Ctrl: 'LeftControl',
  Shift: 'LeftShift',
  Alt: 'LeftAlt',
  Meta: 'LeftSuper',
  Cmd: 'LeftSuper',
  Enter: 'Enter',
  Escape: 'Escape',
  Esc: 'Escape',
  Tab: 'Tab',
  Space: 'Space',
  Backspace: 'Backspace'
};

export class DesktopAutomation {
  constructor({ config, logger, focusManager, locator }) {
    this.config = config;
    this.logger = logger;
    this.focusManager = focusManager;
    this.locator = locator;
    this.nut = null;
    this.automationLock = Promise.resolve();
  }

  async loadNut() {
    if (this.nut) return this.nut;
    this.nut = await import('@nut-tree-fork/nut-js');
    this.nut.keyboard.config.autoDelayMs = 20;
    this.nut.mouse.config.autoDelayMs = 20;
    return this.nut;
  }

  // Serializes every top-level automation action (keyboard/mouse) so two
  // sessions being checked around the same time can never interleave key
  // presses - a real cause of keys getting stuck "held down" (auto-repeating)
  // when one sequence's press/release overlapped with another's.
  withLock(fn) {
    const run = this.automationLock.then(fn, fn);
    this.automationLock = run.then(() => {}, () => {});
    return run;
  }

  async focusAntigravity(session) {
    const success = await this.focusManager.verifyFocus(session.windowHandle);
    if (!success) {
      throw new Error(`Failed to focus Antigravity window for session "${session.projectName}".`);
    }
  }

  async findPromptBox(session) {
    await this.focusAntigravity(session);
    const point = this.config.antigravity.fallbackCoordinates.promptBox;
    return point ? { strategy: 'coordinate', point } : { strategy: 'keyboard-shortcut' };
  }

  async typePrompt(session, text) {
    return this.withLock(() => this.typePromptImpl(session, text));
  }

  async typePromptImpl(session, text) {
    await this.focusAntigravity(session);
    const promptBox = await this.findPromptBox(session);

    if (promptBox.point) {
      await this.click(promptBox.point.x, promptBox.point.y);
    } else {
      await this.hotkey(this.config.antigravity.promptShortcut);
    }

    let verified = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        // Clear box using Backspace
        await this.hotkey(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
        await new Promise((resolve) => setTimeout(resolve, 100));
        await this.hotkey('Backspace');
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Write to clipboard & paste
        await writeClipboard(text);
        await this.hotkey(process.platform === 'darwin' ? 'Meta+V' : 'Control+V');
        await new Promise((resolve) => setTimeout(resolve, 300));

        // Verify content via Copy
        await this.hotkey(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
        await new Promise((resolve) => setTimeout(resolve, 100));
        await this.hotkey(process.platform === 'darwin' ? 'Meta+C' : 'Control+C');
        await new Promise((resolve) => setTimeout(resolve, 100));

        const pasted = await readClipboard();
        if (pasted.trim() === text.trim()) {
          verified = true;
          // Clear the selection with Right instead of Escape - Escape blurs
          // or dismisses the input entirely in many chat panels, which would
          // leave the pasted text sitting unsent when Enter is pressed next.
          await this.hotkey('Right');
          break;
        }
        this.logger.warn('Paste verification mismatch, retrying...', {
          attempt: attempt + 1,
          expected: text,
          actual: pasted
        });
      } catch (err) {
        this.logger.warn('Paste attempt failed with error', { error: err.message });
      }
    }

    if (!verified) {
      throw new Error('Clipboard verification failed. Text could not be reliably pasted.');
    }
  }

  async pressEnter(session) {
    return this.withLock(() => this.pressEnterImpl(session));
  }

  async pressEnterImpl(session) {
    if (session) {
      await this.focusAntigravity(session);
    }
    const { keyboard, Key } = await this.loadNut();
    try {
      await keyboard.pressKey(Key.Enter);
    } finally {
      await keyboard.releaseKey(Key.Enter);
    }
  }

  async click(x, y) {
    const { mouse, Button, Point } = await this.loadNut();
    await mouse.setPosition(new Point(x, y));
    await mouse.click(Button.LEFT);
  }

  async hotkey(shortcut) {
    const { keyboard, Key } = await this.loadNut();
    const keys = shortcut.split('+').map((key) => key.trim()).filter(Boolean);
    const resolved = keys.map((key) => Key[keyAliases[key] ?? key]);

    if (resolved.some((key) => key === undefined)) {
      throw new Error(`Unsupported shortcut: ${shortcut}`);
    }

    // Guarantee release even if press partially fails partway through a
    // multi-key combo - otherwise a key can stay physically "held down"
    // at the OS level and auto-repeat indefinitely.
    try {
      await keyboard.pressKey(...resolved);
    } finally {
      await keyboard.releaseKey(...resolved.reverse());
    }
  }

  async clickApprove(session) {
    return this.withLock(() => this.clickApproveImpl(session));
  }

  async clickApproveImpl(session) {
    await this.focusAntigravity(session);
    const point = this.config.antigravity.fallbackCoordinates.approveButton;
    if (point) {
      await this.click(point.x, point.y);
      return { strategy: 'coordinate' };
    }

    await this.pressEnterImpl();
    return { strategy: 'enter-key' };
  }

  async clickReject(session) {
    return this.withLock(() => this.clickRejectImpl(session));
  }

  async clickRejectImpl(session) {
    await this.focusAntigravity(session);
    const point = this.config.antigravity.fallbackCoordinates.rejectButton;
    if (point) {
      await this.click(point.x, point.y);
      return { strategy: 'coordinate' };
    }

    await this.hotkey('Escape');
    return { strategy: 'escape-key' };
  }

  async captureWindow(session) {
    return this.withLock(() => this.captureWindowImpl(session));
  }

  async captureWindowImpl(session) {
    await fs.mkdir(this.config.screenshotPath, { recursive: true });
    await this.focusAntigravity(session);

    const outputPath = path.join(this.config.screenshotPath, `agremote-${session.projectName}-${Date.now()}.png`);
    const { Window, Monitor } = await import('node-screenshots');
    const windows = Window.all();

    const targetWindow = windows.find((w) => {
      const id = typeof w.id === 'function' ? String(w.id()) : '';
      return id === String(session.windowHandle);
    });

    const image = targetWindow
      ? await targetWindow.captureImage()
      : await Monitor.all()[0]?.captureImage();

    if (!image) {
      throw new Error('No display or window was available for screenshot capture.');
    }

    await fs.writeFile(outputPath, await image.toPng());
    return outputPath;
  }

  // Disabled: this shortcut -> Select All -> Copy sequence has twice left a
  // key stuck "held down" on the real desktop (auto-repeating into whatever
  // window ended up focused, including live source files). Needs a safer
  // implementation - e.g. CDP-based DOM reads instead of keyboard automation
  // - before this can run again. See copyTerminal/copyConversation below.
  async copyTerminal(session) {
    throw new Error('/terminal is temporarily disabled - the copy automation it relies on was causing stuck-key issues on the desktop.');
  }

  async copyConversation(session) {
    throw new Error('/history is temporarily disabled - the copy automation it relies on was causing stuck-key issues on the desktop.');
  }
}
