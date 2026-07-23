#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';

import { runWizard } from '../utils/wizard.js';
import { loadConfig } from '../utils/config.js';
import { createLogger } from '../utils/logger.js';
import { JsonStorage } from '../storage/jsonStorage.js';
import { WorkspaceManager } from '../core/workspaceManager.js';
import { SessionManager } from '../core/sessionManager.js';
import { PluginLoader } from '../core/pluginLoader.js';
import { EventBus, EVENT_TYPES } from '../core/eventBus.js';
import { CommandRouter } from '../services/commandRouter.js';
import { Parser } from '../services/parser.js';
import { NotificationService } from '../services/notificationService.js';
import { AuthService } from '../services/authService.js';
import { registerCommands } from '../commands/index.js';
import { GitController } from '../controller/gitController.js';
import { ScreenshotController } from '../controller/screenshotController.js';

// Resolve directory roots
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const command = args[0] || 'start';

if (command === 'init') {
  await runWizard(rootDir);
  process.exit(0);
}

if (command !== 'start') {
  console.log(`
AgentBridge CLI Help:

  agentbridge init   - Interactive setup wizard
  agentbridge start  - Start the platform runner
`);
  process.exit(0);
}

console.log('Starting AgentBridge...');
const config = await loadConfig(rootDir);
const logger = createLogger(config);
const eventBus = new EventBus({ logger });

const storage = new JsonStorage({ config, logger });
await storage.init();

const workspaceManager = new WorkspaceManager({ storage, logger });
await workspaceManager.init(config.workspaces);

const pluginLoader = new PluginLoader({ logger });
await pluginLoader.loadPlugins(path.join(rootDir, 'plugins'));

const sessionManager = new SessionManager({
  config,
  logger,
  storage,
  workspaceManager,
  pluginLoader
});
await sessionManager.init();
sessionManager.start();

const parser = new Parser();
const authService = new AuthService({ config, storage, logger });

// Dynamic active session proxy for controllers
class ActiveSessionAdapterProxy {
  constructor(sessionManager) {
    this.sessionManager = sessionManager;
  }
  get activeAdapter() {
    const s = this.sessionManager.getActiveSession();
    if (!s) throw new Error('No active session.');
    return this.sessionManager.getAdapterInstance(s.agentType);
  }
  async focus(session) {
    const s = session || this.sessionManager.getActiveSession();
    if (!s) throw new Error('No active session.');
    return this.sessionManager.getAdapterInstance(s.agentType).focus(s);
  }
  async typePrompt(session, text) {
    const s = session || this.sessionManager.getActiveSession();
    if (!s) throw new Error('No active session.');
    return this.sessionManager.getAdapterInstance(s.agentType).typePrompt(s, text);
  }
  async pressEnter() {
    const s = this.sessionManager.getActiveSession();
    if (!s) throw new Error('No active session.');
    return this.sessionManager.getAdapterInstance(s.agentType).pressEnter();
  }
  async clickApprove(session) {
    const s = session || this.sessionManager.getActiveSession();
    if (!s) throw new Error('No active session.');
    return this.sessionManager.getAdapterInstance(s.agentType).clickApprove(s);
  }
  async clickReject(session) {
    const s = session || this.sessionManager.getActiveSession();
    if (!s) throw new Error('No active session.');
    return this.sessionManager.getAdapterInstance(s.agentType).clickReject(s);
  }
  async captureWindow(session) {
    const s = session || this.sessionManager.getActiveSession();
    if (!s) throw new Error('No active session.');
    return this.sessionManager.getAdapterInstance(s.agentType).captureWindow(s);
  }
  async getStatus(session) {
    const s = session || this.sessionManager.getActiveSession();
    if (!s) throw new Error('No active session.');
    return this.sessionManager.getAdapterInstance(s.agentType).getStatus(s);
  }
  async detectApprovalRequest(session) {
    const s = session || this.sessionManager.getActiveSession();
    if (!s) throw new Error('No active session.');
    return this.sessionManager.getAdapterInstance(s.agentType).detectApprovalRequest(s);
  }
  async copyTerminal(session) {
    const s = session || this.sessionManager.getActiveSession();
    if (!s) throw new Error('No active session.');
    return this.sessionManager.getAdapterInstance(s.agentType).copyTerminal(s);
  }
  async copyConversation(session) {
    const s = session || this.sessionManager.getActiveSession();
    if (!s) throw new Error('No active session.');
    return this.sessionManager.getAdapterInstance(s.agentType).copyConversation(s);
  }
  // Expose locator for compatibility
  get locator() {
    return this.activeAdapter.locator;
  }
}

const activeAdapterProxy = new ActiveSessionAdapterProxy(sessionManager);

// Wrapper classes to handle fallback to active session
class DynamicGitController {
  constructor({ sessionManager, config, logger }) {
    this.sessionManager = sessionManager;
    this.impl = new GitController({ config, logger });
  }
  async branch(session) {
    const s = session || this.sessionManager.getActiveSession();
    return this.impl.branch(s);
  }
  async commit(session, msg) {
    const s = session || this.sessionManager.getActiveSession();
    return this.impl.commit(s, msg);
  }
  async push(session) {
    const s = session || this.sessionManager.getActiveSession();
    return this.impl.push(s);
  }
  async deploy(session) {
    const s = session || this.sessionManager.getActiveSession();
    return this.impl.deploy(s);
  }
  async diff(session) {
    const s = session || this.sessionManager.getActiveSession();
    return this.impl.diff(s);
  }
}

class DynamicScreenshotController {
  constructor({ sessionManager, adapter, config, logger, eventBus }) {
    this.sessionManager = sessionManager;
    this.eventBus = eventBus;
    this.impl = new ScreenshotController({ adapter, config, logger });
  }
  async capture(session) {
    const s = session || this.sessionManager.getActiveSession();
    const mediaPath = await this.impl.capture(s);
    this.eventBus?.publish(EVENT_TYPES.SCREENSHOT_AVAILABLE, { session: s, mediaPath });
    return mediaPath;
  }
}

// Controller delegation mapping
const controllers = {
  antigravity: {
    sendPrompt: async (id, msg) => {
      const s = sessionManager.sessions.get(id) || sessionManager.getActiveSession();
      if (!s) throw new Error('No target session.');
      const adapter = sessionManager.getAdapterInstance(s.agentType);
      await adapter.typePrompt(s, msg);
      await adapter.pressEnter(s);
      await sessionManager.updateSessionState(s.id, {
        lastPrompt: msg,
        currentTask: msg,
        status: 'Running'
      });
      return { sent: true };
    },
    approve: async (id) => {
      const s = sessionManager.sessions.get(id) || sessionManager.getActiveSession();
      if (!s) throw new Error('No target session.');
      const adapter = sessionManager.getAdapterInstance(s.agentType);
      const res = await adapter.clickApprove(s);
      await sessionManager.updateSessionState(s.id, { status: 'Running', approvalPending: false });
      eventBus.publish(EVENT_TYPES.APPROVAL_GRANTED, { session: s });
      return res;
    },
    reject: async (id) => {
      const s = sessionManager.sessions.get(id) || sessionManager.getActiveSession();
      if (!s) throw new Error('No target session.');
      const adapter = sessionManager.getAdapterInstance(s.agentType);
      const res = await adapter.clickReject(s);
      await sessionManager.updateSessionState(s.id, { status: 'Rejected' });
      eventBus.publish(EVENT_TYPES.APPROVAL_REJECTED, { session: s });
      return res;
    },
    getStatus: async (id) => {
      const s = sessionManager.sessions.get(id) || sessionManager.getActiveSession();
      if (!s) throw new Error('No target session.');
      const adapter = sessionManager.getAdapterInstance(s.agentType);
      const res = await adapter.getStatus(s);
      // Fallbacks for generic CPU/memory metrics
      const cpu = { currentLoad: 3.5 };
      const mem = { active: 3.5 * 1024, total: 16 * 1024 };
      try {
        const si = await import('systeminformation');
        const load = await si.default.currentLoad();
        const memory = await si.default.mem();
        cpu.currentLoad = load.currentLoad;
        mem.active = memory.active;
        mem.total = memory.total;
      } catch {}
      return {
        ...s,
        ...res,
        cpuUsage: `${cpu.currentLoad.toFixed(1)}%`,
        memoryUsage: `${((mem.active / mem.total) * 100).toFixed(1)}%`,
        timeRunning: 'unknown'
      };
    },
    getTerminalOutput: async (id) => {
      const s = sessionManager.sessions.get(id);
      if (!s) throw new Error('No target session.');
      return sessionManager.getAdapterInstance(s.agentType).copyTerminal(s);
    },
    getConversationHistory: async (id) => {
      const s = sessionManager.sessions.get(id);
      if (!s) throw new Error('No target session.');
      return sessionManager.getAdapterInstance(s.agentType).copyConversation(s);
    },
    stop: async (id) => {
      const s = sessionManager.sessions.get(id);
      if (!s) throw new Error('No target session.');
      await sessionManager.getAdapterInstance(s.agentType).clickReject(s);
      await sessionManager.updateSessionState(s.id, { status: 'Stopped' });
      return { stopped: true };
    },
    resume: async (id) => {
      const s = sessionManager.sessions.get(id);
      if (!s) throw new Error('No target session.');
      await sessionManager.getAdapterInstance(s.agentType).focus(s);
      await sessionManager.updateSessionState(s.id, { status: 'Running' });
      return { resumed: true };
    },
    restart: async (id) => {
      const s = sessionManager.sessions.get(id);
      if (!s) throw new Error('No target session.');
      await sessionManager.getAdapterInstance(s.agentType).clickReject(s);
      await sessionManager.updateSessionState(s.id, { status: 'Stopped' });
      if (s.lastPrompt) {
        const adapter = sessionManager.getAdapterInstance(s.agentType);
        await adapter.typePrompt(s, s.lastPrompt);
        await adapter.pressEnter(s);
        await sessionManager.updateSessionState(s.id, { status: 'Running' });
        return { restarted: true, replayedPrompt: true };
      }
      return { restarted: true, replayedPrompt: false };
    }
  },
  git: new DynamicGitController({ sessionManager, config, logger }),
  screenshot: new DynamicScreenshotController({ sessionManager, adapter: activeAdapterProxy, config, logger, eventBus })
};

const router = new CommandRouter({ parser, controllers, storage, sessionManager, logger, config });
registerCommands(router);

// Map dynamic adapter checks to notifications
const dynamicAdapterProxy = {
  detectApprovalRequest: async (session) => {
    const adapter = sessionManager.getAdapterInstance(session.agentType);
    return adapter.detectApprovalRequest(session);
  },
  getStatus: async (session) => {
    const adapter = sessionManager.getAdapterInstance(session.agentType);
    return adapter.getStatus(session);
  }
};

const notificationService = new NotificationService({
  adapter: dynamicAdapterProxy,
  sessionManager,
  logger,
  eventBus,
  intervalMs: config.monitor.intervalMs,
  progressIntervalMs: config.monitor.progressIntervalMs
});

// Instantiate every messenger enabled in config.messengers.* - any number
// can run at once. NotificationService broadcasts to all of them; a
// messenger that fails to connect (e.g. missing Discord token) is logged
// and skipped rather than taking the whole platform down.
const activeMessengers = [];

for (const [name, messengerConfig] of Object.entries(config.messengers || {})) {
  if (!messengerConfig.enabled) {
    logger.info(`Messenger "${name}" is disabled, skipping.`, { name });
    continue;
  }

  const MessengerClass = pluginLoader.messengers.get(name.toLowerCase());
  if (!MessengerClass) {
    logger.warn(`Messenger "${name}" is enabled but no matching plugin was loaded.`, { name });
    continue;
  }

  const messenger = new MessengerClass({
    config,
    logger,
    authService,
    router,
    sessionManager,
    notificationService,
    eventBus,
    storage
  });

  try {
    await messenger.connect();
    activeMessengers.push({ name, messenger });
    logger.info(`Messenger "${name}" connected.`, { name });
  } catch (error) {
    logger.error(`Messenger "${name}" failed to connect - continuing without it.`, {
      name,
      error: error.message
    });
  }
}

if (!activeMessengers.length) {
  throw new Error('No messengers connected. Enable at least one in config.yaml/.env (see messengers.telegram / messengers.discord).');
}

notificationService.on('notification', async (event) => {
  for (const { name, messenger } of activeMessengers) {
    try {
      await messenger.notify(event);
    } catch (error) {
      logger.warn(`Messenger "${name}" failed to deliver a notification.`, { name, error: error.message });
    }
  }
});

async function shutdown(signal) {
  logger.info(`Received ${signal}; shutting down`);
  notificationService.stop();
  sessionManager.stop();
  for (const { name, messenger } of activeMessengers) {
    try {
      await messenger.disconnect();
    } catch (error) {
      logger.warn(`Messenger "${name}" failed to disconnect cleanly.`, { name, error: error.message });
    }
  }
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

notificationService.start();
logger.info('AgentBridge platform runner started');

const connectedMessengersList = activeMessengers.map(({ name }) => `- ${name}`);
const workspacesList = workspaceManager.listWorkspaces().map(w => `- ${w.name} (${w.path})`);
const activeSession = sessionManager.getActiveSession();
const activeSessionStr = activeSession ? `${activeSession.projectName} (ID: ${activeSession.id})` : 'none';
const registeredSessionsList = sessionManager.getAllSessions().map(s => `- ${s.projectName} (ID: ${s.id}, State: ${s.status})`);
const registeredCommandsList = Array.from(router.handlers.keys()).map(c => `/${c}`);

console.log(`
======================================
     AgentBridge Startup Diagnostics
======================================
Connected Messengers:
${connectedMessengersList.length ? connectedMessengersList.join('\n') : '  None'}

Configured Workspaces:
${workspacesList.length ? workspacesList.join('\n') : '  None'}

Active Session:
  ${activeSessionStr}

Registered Sessions:
${registeredSessionsList.length ? registeredSessionsList.join('\n') : '  None'}

Registered Commands: [${registeredCommandsList.join(', ')}]
======================================
`);
