import { EventEmitter } from 'node:events';

export class NotificationService extends EventEmitter {
  constructor({ adapter, sessionManager, logger, intervalMs }) {
    super();
    this.adapter = adapter;
    this.sessionManager = sessionManager;
    this.logger = logger;
    this.intervalMs = intervalMs;
    this.timer = null;
    this.lastApprovals = new Map(); // id -> signature
    this.lastStates = new Map();    // id -> state
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
      } catch (error) {
        this.logger.warn('Error checking session status', { sessionId: session.id, error: error.message });
      }
    }
  }
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
