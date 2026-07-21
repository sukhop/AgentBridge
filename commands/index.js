import { approveCommand } from './approve.js';
import { rejectCommand } from './reject.js';
import { helpCommand } from './help.js';
import { historyCommand } from './history.js';
import { logsCommand } from './logs.js';
import { promptCommand } from './prompt.js';
import { restartCommand } from './restart.js';
import { resumeCommand } from './resume.js';
import { screenshotCommand } from './screenshot.js';
import { statusCommand } from './status.js';
import { stopCommand } from './stop.js';
import { terminalCommand } from './terminal.js';
import { branchCommand } from './branch.js';
import { commitCommand } from './commit.js';
import { deployCommand } from './deploy.js';
import { pushCommand } from './push.js';
import { sessionsCommand } from './sessions.js';
import { openCommand } from './open.js';
import { useCommand } from './use.js';

export function registerCommands(router) {
  router.register('start', helpCommand);
  router.register('approve', approveCommand);
  router.register('reject', rejectCommand);
  router.register('help', helpCommand);
  router.register('history', historyCommand);
  router.register('logs', logsCommand);
  router.register('prompt', promptCommand);
  router.register('restart', restartCommand);
  router.register('resume', resumeCommand);
  router.register('screenshot', screenshotCommand);
  router.register('status', statusCommand);
  router.register('stop', stopCommand);
  router.register('terminal', terminalCommand);
  router.register('project', projectCommand);
  router.register('file', fileCommand);
  router.register('error', errorCommand);
  router.register('branch', branchCommand);
  router.register('commit', commitCommand);
  router.register('push', pushCommand);
  router.register('deploy', deployCommand);
  router.register('sessions', sessionsCommand);
  router.register('projects', sessionsCommand);
  router.register('use', useCommand);
  router.register('open', openCommand);
}

async function projectCommand({ storage }) {
  const { currentProject } = storage.getState();
  return `Project: ${currentProject || 'unknown'}`;
}

async function fileCommand({ controllers, storage }) {
  const status = await controllers.antigravity.getStatus();
  const activeFile = status.activeFile || storage.getState().activeFile;
  return `Active file: ${activeFile || 'unknown'}`;
}

async function errorCommand({ storage }) {
  const { lastError } = storage.getState();
  return lastError ? `Last error:\n${lastError}` : 'No recorded error.';
}
