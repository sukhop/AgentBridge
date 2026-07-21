import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function writeClipboard(text) {
  const clipboardy = await import('clipboardy');
  await clipboardy.default.write(text);
}

export async function readClipboard() {
  const clipboardy = await import('clipboardy');
  return clipboardy.default.read();
}

export async function readClipboardViaPowerShell() {
  const { stdout } = await execFileAsync('powershell.exe', [
    '-NoProfile',
    '-Command',
    'Get-Clipboard'
  ]);
  return stdout.trim();
}
