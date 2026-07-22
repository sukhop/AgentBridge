import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export class WindowLocator {
  constructor({ config, logger }) {
    this.windowHint = config.antigravity.windowHint;
    this.logger = logger;
  }

  async getAntigravityWindow() {
    const windows = await this.getAllAntigravityWindows();
    return windows[0] || null;
  }

  async getAllAntigravityWindows() {
    if (process.platform === 'linux') {
      return this.getAllAntigravityWindowsLinux();
    }
    return this.getAllAntigravityWindowsWindows();
  }

  async getAllAntigravityWindowsWindows() {
    const script = `
      Add-Type @"
      using System;
      using System.Runtime.InteropServices;
      using System.Text;
      public class WinApi {
        [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
        [StructLayout(LayoutKind.Sequential)]
        public struct RECT {
          public int Left;
          public int Top;
          public int Right;
          public int Bottom;
        }
      }
"@
      $hint = ${JSON.stringify(this.windowHint)}
      $processes = Get-Process | Where-Object { $_.MainWindowTitle -and $_.MainWindowTitle -like "*$hint*" }
      $results = @()
      foreach ($p in $processes) {
        $handle = $p.MainWindowHandle
        if ($handle -ne [IntPtr]::Zero) {
          $rect = New-Object WinApi+RECT
          $ok = [WinApi]::GetWindowRect($handle, [ref]$rect)
          $bounds = if ($ok) {
            @{
              x = $rect.Left
              y = $rect.Top
              width = $rect.Right - $rect.Left
              height = $rect.Bottom - $rect.Top
            }
          } else {
            $null
          }
          $path = try { $p.Path } catch { "" }
          $results += @{
            PID = $p.Id
            WindowHandle = $handle.ToInt64()
            WindowTitle = $p.MainWindowTitle
            ProcessName = $p.ProcessName
            ExecutablePath = $path
            Bounds = $bounds
          }
        }
      }
      $results | ConvertTo-Json -Compress
    `;

    try {
      const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-Command', script], { timeout: 5000 });
      if (!stdout.trim()) return [];
      const parsed = JSON.parse(stdout);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch (error) {
      this.logger.debug('Failed to get all Antigravity windows', { message: error.message });
      return [];
    }
  }

  async getAllAntigravityWindowsLinux() {
    const hint = this.windowHint.toLowerCase();
    let stdout;
    try {
      ({ stdout } = await execFileAsync('wmctrl', ['-l', '-p'], { timeout: 5000 }));
    } catch (error) {
      if (error.code === 'ENOENT') {
        this.logger.warn('wmctrl is not installed - window detection is disabled on Linux until you run: sudo apt install wmctrl');
      } else {
        this.logger.debug('Failed to get all Antigravity windows (Linux)', { message: error.message });
      }
      return [];
    }

    const results = [];
    for (const rawLine of stdout.split('\n')) {
      const line = rawLine.trim();
      if (!line) continue;
      const match = line.match(/^(\S+)\s+(-?\d+)\s+(\d+)\s+(\S+)\s+(.*)$/);
      if (!match) continue;
      const [, idHex, , pidStr, , title] = match;
      if (!title.toLowerCase().includes(hint)) continue;
      results.push({
        PID: Number(pidStr),
        WindowHandle: parseInt(idHex, 16),
        WindowTitle: title,
        ProcessName: 'antigravity',
        ExecutablePath: '',
        Bounds: null
      });
    }
    return results;
  }

  async getCurrentWindow() {
    if (process.platform === 'linux') {
      return this.getCurrentWindowLinux();
    }
    return this.getCurrentWindowWindows();
  }

  async getCurrentWindowWindows() {
    const script = `
      Add-Type @"
      using System;
      using System.Runtime.InteropServices;
      using System.Text;
      public class WinApi {
        [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
        [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
      }
"@
      $buffer = New-Object System.Text.StringBuilder 512
      $handle = [WinApi]::GetForegroundWindow()
      [void][WinApi]::GetWindowText($handle, $buffer, $buffer.Capacity)
      @{ handle = $handle.ToInt64(); title = $buffer.ToString() } | ConvertTo-Json -Compress
    `;

    try {
      const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-Command', script], { timeout: 5000 });
      return stdout.trim() ? JSON.parse(stdout) : null;
    } catch (error) {
      this.logger.debug('Current window lookup failed', { message: error.message });
      return null;
    }
  }

  async getCurrentWindowLinux() {
    try {
      const { stdout: activeOut } = await execFileAsync('xprop', ['-root', '-notype', '_NET_ACTIVE_WINDOW'], { timeout: 5000 });
      const idMatch = activeOut.match(/#\s*(0x[0-9a-fA-F]+)/);
      if (!idMatch) return null;
      const idHex = idMatch[1];

      const title = await this.readWindowTitleLinux(idHex);
      return { handle: parseInt(idHex, 16), title };
    } catch (error) {
      this.logger.debug('Current window lookup failed (Linux)', { message: error.message });
      return null;
    }
  }

  async readWindowTitleLinux(idHex) {
    for (const property of ['_NET_WM_NAME', 'WM_NAME']) {
      try {
        const { stdout } = await execFileAsync('xprop', ['-id', idHex, '-notype', property], { timeout: 5000 });
        const match = stdout.match(/=\s*"(.*)"/);
        if (match) return match[1];
      } catch {
        // Try the next property.
      }
    }
    return '';
  }
}
