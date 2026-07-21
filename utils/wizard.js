import readline from 'node:readline';
import fs from 'node:fs/promises';
import path from 'node:path';
import { dump } from 'js-yaml';

export async function runWizard(rootDir) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const ask = (query, defaultValue) => new Promise((resolve) => {
    const formattedQuery = defaultValue ? `${query} (${defaultValue}): ` : `${query}: `;
    rl.question(formattedQuery, (answer) => {
      resolve(answer.trim() || defaultValue);
    });
  });

  console.log('\n======================================');
  console.log('      AgentBridge Setup Wizard       ');
  console.log('======================================\n');

  try {
    const messenger = await ask('1. Preferred messenger (telegram/discord/slack)', 'telegram');
    const token = await ask('2. Bot Token / Credentials API Key');
    const defaultAgent = await ask('3. Default AI agent adapter (antigravity/cursor/claudecode/codexcli)', 'antigravity');
    const projectPath = await ask('4. Default project directory path', rootDir);
    const notifications = await ask('5. Enable real-time state change notifications? (yes/no)', 'yes');

    rl.close();

    const config = {
      telegram: {
        botToken: token,
        authorizedChatId: '',
        polling: true,
        debugAuth: false
      },
      agent: {
        default: defaultAgent.toLowerCase()
      },
      screenshotPath: 'screenshots',
      logLevel: 'info',
      deployCommand: '',
      server: {
        port: 3030,
        corsOrigin: '*'
      },
      monitor: {
        intervalMs: 5000
      },
      antigravity: {
        windowHint: 'Antigravity',
        cdpUrl: '',
        promptShortcut: 'Control+L',
        terminalShortcut: 'Control+`',
        conversationShortcut: 'Control+Shift+C',
        executablePath: 'antigravity'
      }
    };

    const configPath = path.join(rootDir, 'config.yaml');
    await fs.writeFile(configPath, dump(config, { indent: 2 }));

    console.log('\n======================================');
    console.log(`✅ Success! Configuration written to:\n${configPath}`);
    console.log('Run the platform using:\n  agentbridge start');
    console.log('======================================\n');
    process.exit(0);
  } catch (error) {
    console.error('Wizard failed:', error.message);
    rl.close();
  }
}
