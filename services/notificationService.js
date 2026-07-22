import { EventEmitter } from 'node:events';
import { extractLastTask } from '../utils/conversation.js';

export class NotificationService extends EventEmitter {
  constructor({ adapter, sessionManager, logger, intervalMs, progressIntervalMs }) {
    super();
    this.adapter = adapter;
    this.sessionManager = sessionManager;
    this.logger = logger;
    this.intervalMs = intervalMs;
    this.progressIntervalMs = progressIntervalMs || 30000;
    this.timer = null;
    this.lastApprovals = new Map(); // id -> signature
    this.lastStates = new Map();    // id -> state
    this.runningSince = new Map();  // id -> timestamp the current run started
    this.lastProgressAt = new Map(); // id -> timestamp of last progress push
    this.lastProgressTitle = new Map(); // id -> windowTitle at last progress push
  }

  start() {
    if (this.timer) return;
    this.logger.debug('NotificationService starting check loop...');
    this.timer = setInterval(() => this.check().catch((error) => {
      this.logger.warn('Monitor check failed', { stack: error.stack });
    }), this.intervalMs);
    this.timer.unref?.();
    this.logger.info('Antigravity monitor started', { intervalMs: this.intervalMs });
  }

  stop() {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
    this.logger.info('Antigravity monitor stopped');
  }

  isRunning() {
    return Boolean(this.timer);
  }

  async check() {
    this.logger.debug('NotificationService check() starting status checks...');
    const sessions = this.sessionManager.getAllSessions().filter((s) => s.status !== 'Closed');

    for (const session of sessions) {
      try {
        this.logger.debug('NotificationService checking session', { id: session.id, project: session.projectName });
        const approval = await this.adapter.detectApprovalRequest(session);
        this.logger.debug('NotificationService approval detection result', { id: session.id, required: approval?.required });
        if (approval?.required) {
          console.log(`\n[DIAGNOSTICS] Adapter event received: Approval Required for ${session.projectName}`);
          const signature = `${approval.title}:${approval.command}`;
          if (signature !== this.lastApprovals.get(session.id)) {
            this.lastApprovals.set(session.id, signature);
            await this.sessionManager.updateSessionState(session.id, {
              status: 'Approval Required',
              approvalPending: true,
              currentTask: approval.command || approval.title
            });
            console.log(`[DIAGNOSTICS] Notification emitted: approval-required`);
            this.emit('notification', {
              type: 'approval-required',
              text: `⚠ ${session.projectName}\n\nApproval Required\n\nCommand:\n${approval.command || approval.title}`,
              session,
              approval
            });
          }
          continue;
        }

        // Clean up approval signature if no longer pending approval
        if (session.approvalPending) {
          this.logger.debug('NotificationService clearing pending approval', { id: session.id });
          this.lastApprovals.delete(session.id);
          await this.sessionManager.updateSessionState(session.id, { approvalPending: false });
        }

        // Check general status changes
        const status = await this.adapter.getStatus(session);
        const lastState = this.lastStates.get(session.id);
        this.logger.debug('NotificationService retrieved session status', { id: session.id, lastState, newState: status.agentState });

        if (status.agentState && status.agentState !== lastState) {
          console.log(`\n[DIAGNOSTICS] Adapter event received: State Change (${lastState} -> ${status.agentState}) for ${session.projectName}`);
          this.lastStates.set(session.id, status.agentState);
          await this.sessionManager.updateSessionState(session.id, { status: status.agentState });

          if (status.agentState === 'Running') {
            this.runningSince.set(session.id, Date.now());
            this.lastProgressAt.delete(session.id);
            this.lastProgressTitle.delete(session.id);
          } else {
            this.runningSince.delete(session.id);
          }

          const text = getNotificationText(session.projectName, lastState, status.agentState);
          if (text) {
            console.log(`[DIAGNOSTICS] Notification emitted: ${status.agentState.toLowerCase()}`);
            this.emit('notification', {
              type: status.agentState.toLowerCase(),
              text,
              session,
              status
            });
          }
        }

        if (status.agentState === 'Running') {
          await this.maybeEmitProgress(session);
        }
      } catch (error) {
        this.logger.warn('Error checking session status', { sessionId: session.id, error: error.message });
      }
    }
  }

  // Pushes a live "still working" update while a session stays in the
  // Running state, instead of leaving the user with only a start/complete
  // notification and no visibility in between. Fires whenever the window
  // title changes (a new file/step) or the progress interval elapses,
  // whichever comes first - so it reflects real progress, not just a timer.
  // Each firing re-reads the actual conversation panel so the text reflects
  // what the agent is doing *right now*, not a frozen echo of the first prompt.
  async maybeEmitProgress(session) {
    const now = Date.now();
    const lastAt = this.lastProgressAt.get(session.id) || this.runningSince.get(session.id) || now;
    const titleChanged = this.lastProgressTitle.get(session.id) !== session.windowTitle;

    if (!titleChanged && now - lastAt < this.progressIntervalMs) return;

    this.lastProgressAt.set(session.id, now);
    this.lastProgressTitle.set(session.id, session.windowTitle);

    const startedAt = this.runningSince.get(session.id) || now;
    const elapsed = formatElapsed(now - startedAt);
    const currentFile = (session.windowTitle || '').split(' - ')[0] || 'unknown';

    let liveSnippet = null;
    if (typeof this.adapter.copyConversation === 'function') {
      try {
        const history = await this.adapter.copyConversation(session);
        liveSnippet = extractLastTask(history);
      } catch (error) {
        this.logger.debug('Live status snippet fetch failed', { sessionId: session.id, error: error.message });
      }
    }

    const lines = [`⏳ ${session.projectName}`, '', `Still working (${elapsed})`, `Current file: ${currentFile}`];
    if (liveSnippet) {
      lines.push(`Latest: ${liveSnippet}`);
    } else if (session.currentTask) {
      lines.push(`Task: ${session.currentTask}`);
    }

    console.log(`[DIAGNOSTICS] Notification emitted: progress`);
    this.emit('notification', {
      type: 'progress',
      text: lines.join('\n'),
      session
    });
  }
}

function formatElapsed(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function getNotificationText(projectName, fromState, toState) {
  if (!fromState) return null; // Avoid initial state load notification flood
  const from = fromState.toLowerCase();
  const to = toState.toLowerCase();

  if (to === 'running' && from !== 'running') {
    return `🟢 ${projectName}\n\nStarted working.`;
  }
  if (to === 'completed' || to === 'finished') {
    return `✅ ${projectName}\n\nTask Complete`;
  }
  if (to === 'stopped' && from !== 'stopped') {
    return `🔴 ${projectName}\n\nStopped working.`;
  }
  if (to === 'error' || to === 'failed') {
    return `❌ ${projectName}\n\nError occurred.`;
  }
  return null;
}
