const COMMANDS = new Set([
  'status',
  'prompt',
  'approve',
  'reject',
  'screenshot',
  'terminal',
  'logs',
  'history',
  'stop',
  'resume',
  'restart',
  'start',
  'help',
  'project',
  'file',
  'error',
  'commit',
  'push',
  'deploy',
  'branch',
  'sessions',
  'projects',
  'use',
  'open'
]);

export class Parser {
  parse(input = '') {
    const text = String(input).trim();
    if (!text) return { name: 'help', args: '', raw: input, implicit: false };

    const [firstToken, ...rest] = text.split(/\s+/);
    const isSlashCommand = firstToken.startsWith('/');
    const lowerToken = firstToken
      .replace(/^\//, '')
      .split('@')[0]
      .toLowerCase();

    if (lowerToken === 'prompt') {
      return { name: 'prompt', args: rest.join(' ').trim(), raw: text, implicit: false };
    }

    if (COMMANDS.has(lowerToken)) {
      return { name: lowerToken, args: rest.join(' ').trim(), raw: text, implicit: false };
    }

    if (isSlashCommand) {
      return { name: lowerToken, args: rest.join(' ').trim(), raw: text, implicit: false };
    }

    return { name: 'prompt', args: text, raw: text, implicit: true };
  }
}

export const supportedCommands = [...COMMANDS];
