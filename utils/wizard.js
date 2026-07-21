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
        botToken: '',           // Set via TELEGRAM_BOT_TOKEN in .env
        authorizedChatId: '',   // Set via AUTHORIZED_CHAT_ID in .env
        polling: true,
        debugAuth: false
      },
      agent: {
        default: defaultAgent.toLowerCase()
      },
      workspaces: [
        {
          name: path.basename(projectPath) || 'DefaultProject',
          path: projectPath,
          agentType: defaultAgent.toLowerCase()
        }
      ],
      screenshotPath: 'screenshots',
      logLevel: 'info',
      deployCommand: '',
      server: {
        port: 3030,
        corsOrigin: '*'
      },
      monitor: {
        intervalMs: notifications === 'yes' ? 5000 : 0
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

    // Write secrets into .env so they are never committed to config.yaml
    const envPath = path.join(rootDir, '.env');
    let existingEnv = '';
    try { existingEnv = await fs.readFile(envPath, 'utf8'); } catch { /* no .env yet */ }

    const envLines = existingEnv.split('\n').filter(Boolean);
    const setEnvVar = (lines, key, value) => {
      const idx = lines.findIndex(l => l.startsWith(`${key}=`));
      if (idx >= 0) lines[idx] = `${key}=${value}`;
      else lines.push(`${key}=${value}`);
    };
    setEnvVar(envLines, 'TELEGRAM_BOT_TOKEN', token);
    await fs.writeFile(envPath, envLines.join('\n') + '\n');

    console.log('\n======================================');
    console.log(`✅ Success! Configuration written to:\n${configPath}`);
    console.log(`✅ Bot token written to:\n${envPath}`);
    console.log('Run the platform using:\n  agentbridge start');
    console.log('======================================\n');
    process.exit(0);
  } catch (error) {
    console.error('Wizard failed:', error.message);
    rl.close();
  }
}
