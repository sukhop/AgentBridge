export async function helpCommand() {
  return [
    'AGRemote Telegram commands:',
    '',
    '/start',
    '/help',
    '/status',
    '/prompt <message>',
    '/screenshot',
    '/approve',
    '/reject',
    '/terminal',
    '/logs',
    '/history',
    '/stop',
    '/resume',
    '/restart',
    '/commit <message>',
    '/push',
    '/deploy',
    '/branch',
    '',
    'Plain text is treated as an Antigravity prompt.'
  ].join('\n');
}
