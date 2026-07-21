import path from 'node:path';
import si from 'systeminformation';

export class AntigravityController {
  constructor({ adapter, sessionManager, logger }) {
    this.adapter = adapter;
    this.sessionManager = sessionManager;
    this.logger = logger;
  }

  async sendPrompt(sessionId, message) {
    if (!message?.trim()) {
      const error = new Error('Please send a prompt after the command.');
      error.expose = true;
      throw error;
    }

    const session = this.sessionManager.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found.`);
    }

    try {
      await this.adapter.typePrompt(session, message);
      await this.adapter.pressEnter();

      const promptHistory = [...(session.promptHistory || []), message];
      const taskHistory = [...(session.taskHistory || []), message];

      await this.sessionManager.updateSessionState(sessionId, {
        lastPrompt: message,
        currentTask: message,
        status: 'Running',
        promptHistory,
        taskHistory
      });
      return { sent: true };
    } catch (error) {
      this.logger.error('Prompt send failed', { stack: error.stack });
      const errors = [...(session.errors || []), error.message];
      await this.sessionManager.updateSessionState(sessionId, { errors });
      throw error;
    }
  }

  async approve(sessionId) {
    const session = this.sessionManager.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found.`);
    }

    try {
      const result = await this.adapter.clickApprove(session);
      await this.sessionManager.updateSessionState(sessionId, { status: 'Running', approvalPending: false });
      return result;
    } catch (error) {
      this.logger.error('Approve failed', { stack: error.stack });
      throw error;
    }
  }

  async reject(sessionId) {
    const session = this.sessionManager.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found.`);
    }

    try {
      const result = await this.adapter.clickReject(session);
      await this.sessionManager.updateSessionState(sessionId, { status: 'Rejected' });
      return result;
    } catch (error) {
      this.logger.error('Reject failed', { stack: error.stack });
      throw error;
    }
  }

  async getStatus(sessionId) {
    const session = this.sessionManager.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found.`);
    }

    try {
      const [adapterStatus, cpu, mem] = await Promise.all([
        this.adapter.getStatus(session),
        si.currentLoad(),
        si.mem()
      ]);
      const currentWindow = await this.adapter.getCurrentWindow();
      const activeFile = inferActiveFile(currentWindow?.title ?? adapterStatus.windowTitle);

      if (activeFile && activeFile !== session.activeFile) {
        await this.sessionManager.updateSessionState(sessionId, { activeFile });
      }

      return {
        ...session,
        ...adapterStatus,
        activeFile: activeFile || session.activeFile,
        cpuUsage: `${cpu.currentLoad.toFixed(1)}%`,
        memoryUsage: `${((mem.active / mem.total) * 100).toFixed(1)}%`,
        timeRunning: formatDuration(Date.now() - new Date(session.startedAt).getTime())
      };
    } catch (error) {
      this.logger.error('Status failed', { stack: error.stack });
      throw error;
    }
  }

  async getTerminalOutput(sessionId) {
    const session = this.sessionManager.sessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found.`);

    try {
      return await this.adapter.copyTerminal(session);
    } catch (error) {
      this.logger.error('Terminal copy failed', { stack: error.stack });
      throw error;
    }
  }

  async getConversationHistory(sessionId) {
    const session = this.sessionManager.sessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found.`);

    try {
      const history = await this.adapter.copyConversation(session);
      if (history) {
        const conversationHistory = [...(session.conversationHistory || []), history];
        await this.sessionManager.updateSessionState(sessionId, { conversationHistory });
      }
      return history;
    } catch (error) {
      this.logger.error('Conversation copy failed', { stack: error.stack });
      throw error;
    }
  }

  async stop(sessionId) {
    const session = this.sessionManager.sessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found.`);
    await this.adapter.clickReject(session);
    await this.sessionManager.updateSessionState(sessionId, { status: 'Stopped' });
    return { stopped: true };
  }

  async resume(sessionId) {
    const session = this.sessionManager.sessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found.`);
    await this.adapter.focusAntigravity(session);
    await this.sessionManager.updateSessionState(sessionId, { status: 'Running' });
    return { resumed: true };
  }

  async restart(sessionId) {
    const session = this.sessionManager.sessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found.`);
    const { lastPrompt } = session;
    await this.stop(sessionId);
    if (lastPrompt) {
      await this.sendPrompt(sessionId, lastPrompt);
      return { restarted: true, replayedPrompt: true };
    }
    await this.resume(sessionId);
    return { restarted: true, replayedPrompt: false };
  }
}

function inferActiveFile(title = '') {
  const parts = title.split(/[-|]/).map((part) => part.trim()).filter(Boolean);
  const candidate = parts.find((part) => /\.[a-z0-9]+$/i.test(part));
  return candidate ? path.basename(candidate) : '';
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return 'unknown';
  const seconds = Math.floor(ms / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  return `${hours}h ${minutes}m ${remainingSeconds}s`;
}
