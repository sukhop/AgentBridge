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

    let chatId = '';
    if (messenger.toLowerCase() === 'telegram' && token) {
      const pairNow = await ask('6. Pair your phone with this bot now? (yes/no)', 'yes');
      if (pairNow.toLowerCase().startsWith('y')) {
        chatId = await waitForTelegramChatId(token);
      }
    }

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
    if (chatId) {
      setEnvVar(envLines, 'AUTHORIZED_CHAT_ID', chatId);
    }
    await fs.writeFile(envPath, envLines.join('\n') + '\n');

    console.log('\n======================================');
    console.log(`✅ Success! Configuration written to:\n${configPath}`);
    console.log(`✅ Bot token written to:\n${envPath}`);
    if (chatId) {
      console.log(`✅ Your phone is paired (chat ID ${chatId} saved).`);
    } else {
      console.log('ℹ️  Phone not paired yet. Message your bot once it is running,');
      console.log('   and it will reply with your Chat ID to add to .env manually.');
    }
    console.log('Run the platform using:\n  agentbridge start');
    console.log('======================================\n');
    process.exit(0);
  } catch (error) {
    console.error('Wizard failed:', error.message);
    rl.close();
  }
}

async function waitForTelegramChatId(token, { timeoutMs = 120000, pollIntervalMs = 2000 } = {}) {
  console.log('\n📱 Open Telegram, find your bot, and send it any message (e.g. "hi").');
  console.log('   Waiting up to 2 minutes for your message...\n');

  const deadline = Date.now() + timeoutMs;
  let offset = 0;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates?offset=${offset}&timeout=0`);
      const data = await res.json();
      if (data.ok) {
        for (const update of data.result) {
          offset = update.update_id + 1;
          const incomingChatId = update.message?.chat?.id;
          if (incomingChatId) {
            console.log(`✅ Got it! Your Telegram chat ID is ${incomingChatId}\n`);
            return String(incomingChatId);
          }
        }
      } else if (data.description) {
        console.log(`⚠ Telegram API error: ${data.description}`);
        break;
      }
    } catch (error) {
      console.log(`⚠ Could not reach Telegram: ${error.message}`);
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  console.log('⏱ Timed out waiting for a message. You can pair later - see the message below.');
  return '';
}
