import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export class FocusManager {
  constructor({ config, logger, locator }) {
    this.config = config;
    this.logger = logger;
    this.locator = locator;
  }

  async focusAntigravity(windowHandle) {
    const handle = Number(windowHandle);
    if (!handle) {
      throw new Error('No window handle provided to focus.');
    }

    const script = `
      Add-Type @"
      using System;
      using System.Runtime.InteropServices;
      public class WinApi {
        [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
        [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
      }
"@
      $handle = [IntPtr]${handle}
      [void][WinApi]::ShowWindowAsync($handle, 9)
      [void][WinApi]::SetForegroundWindow($handle)
    `;

    await execFileAsync('powershell.exe', ['-NoProfile', '-Command', script], { timeout: 5000 });
  }

  async verifyFocus(windowHandle, retries = 5, delayMs = 600) {
    for (let i = 0; i < retries; i++) {
      try {
        await this.focusAntigravity(windowHandle);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        const current = await this.locator.getCurrentWindow();
        if (current && String(current.handle) === String(windowHandle)) {
          this.logger.debug('Focus verification succeeded', { windowHandle });
          return true;
        }
        this.logger.warn('Focus verification failed, retrying...', {
          attempt: i + 1,
          currentHandle: current?.handle,
          targetHandle: windowHandle
        });
      } catch (error) {
        this.logger.warn('Error during focus verification', { error: error.message });
      }
    }
    return false;
  }
}
