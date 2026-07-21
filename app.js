import express from 'express';
import http from 'node:http';
import { Server as SocketServer } from 'socket.io';
import dotenv from 'dotenv';
dotenv.config();

import { loadConfig } from './config/config.js';
import { createLogger } from './utils/logger.js';
import { JsonStorage } from './storage/jsonStorage.js';
import { createAntigravityAdapter } from './desktop/antigravityAdapter.js';
import { SessionManager } from './services/sessionManager.js';
import { AntigravityController } from './controller/antigravityController.js';
import { KeyboardController } from './controller/keyboardController.js';
import { MouseController } from './controller/mouseController.js';
import { ScreenshotController } from './controller/screenshotController.js';
import { WindowController } from './controller/windowController.js';
import { GitController } from './controller/gitController.js';
import { CommandRouter } from './services/commandRouter.js';
import { Parser } from './services/parser.js';
import { NotificationService } from './services/notificationService.js';
import { TelegramService } from './services/telegramService.js';
import { AuthService } from './services/authService.js';
import { registerCommands } from './commands/index.js';

const config = loadConfig();
const logger = createLogger(config);
const app = express();
const server = http.createServer(app);
const io = new SocketServer(server, {
  cors: { origin: config.server.corsOrigin }
});

app.use(express.json());

const storage = new JsonStorage({ config, logger });
const authService = new AuthService({ config, storage, logger });
const parser = new Parser();
const antigravity = createAntigravityAdapter({ config, logger });

const sessionManager = new SessionManager({
  config,
  logger,
  storage,
  locator: antigravity.locator
});

const controllers = {
  antigravity: new AntigravityController({ adapter: antigravity, sessionManager, logger }),
  keyboard: new KeyboardController({ adapter: antigravity, logger }),
  mouse: new MouseController({ adapter: antigravity, logger }),
  screenshot: new ScreenshotController({ adapter: antigravity, config, logger }),
  window: new WindowController({ adapter: antigravity, logger }),
  git: new GitController({ config, logger })
};

const router = new CommandRouter({ parser, controllers, storage, sessionManager, logger });
registerCommands(router);

const notificationService = new NotificationService({
  adapter: antigravity,
  sessionManager,
  logger,
  intervalMs: config.monitor.intervalMs
});

const telegramService = new TelegramService({
  config,
  logger,
  authService,
  router,
  sessionManager,
  notificationService
});

notificationService.on('notification', async (event) => {
  io.emit('notification', event);
  await telegramService.sendNotification(event);
});

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    name: 'AGRemote',
    uptimeSeconds: Math.round(process.uptime()),
    telegramReady: telegramService.isReady(),
    monitorRunning: notificationService.isRunning()
  });
});

app.get('/status', async (_req, res) => {
  const activeSession = sessionManager.getActiveSession();
  if (!activeSession) {
    return res.json({ detected: false, agentState: 'no-sessions' });
  }
  const status = await controllers.antigravity.getStatus(activeSession.id);
  res.json(status);
});

io.on('connection', (socket) => {
  logger.debug('Socket connected', { socketId: socket.id });
  socket.emit('status', {
    telegramReady: telegramService.isReady(),
    monitorRunning: notificationService.isRunning()
  });
});

async function shutdown(signal) {
  logger.info(`Received ${signal}; shutting down`);
  notificationService.stop();
  sessionManager.stop();
  await telegramService.stop();
  server.close(() => process.exit(0));
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => {
  console.error('\n========== UNHANDLED REJECTION ==========');
  console.error(reason);
  console.error(reason?.stack);

  logger.error('Unhandled promise rejection', {
    message: reason?.message,
    stack: reason?.stack
  });
});
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { stack: error.stack });
});

server.listen(config.server.port, async () => {
  logger.info(`AGRemote API listening on http://localhost:${config.server.port}`);
  await storage.init();
  await sessionManager.init();
  sessionManager.start();
  await telegramService.start();
  notificationService.start();
});
