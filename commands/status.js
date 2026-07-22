import { extractLastTask } from '../utils/conversation.js';

export async function statusCommand({ controllers, sessionManager, command }) {
  let session = sessionManager.getActiveSession();
  if (command.args?.trim()) {
    const target = command.args.trim().toLowerCase();
    const found = sessionManager.getAllSessions().find(
      (s) => s.projectName.toLowerCase() === target || s.id === target
    );
    if (!found) return `Project "${command.args}" not found.`;
    session = found;
  }

  if (!session) {
    return 'No active session. Use /open <path> to start a project.';
  }

  const status = await controllers.antigravity.getStatus(session.id);
  const branch = await controllers.git.branch(session).then((b) => b.current).catch(() => 'unknown');

  let currentTask = status.currentTask;
  let taskSource = '';
  if (!currentTask) {
    // AgentBridge only tracks tasks it sent itself via /prompt. If nothing
    // is tracked, read the real conversation panel so a task started
    // directly on the desktop still shows up here.
    try {
      const history = await controllers.antigravity.getConversationHistory(session.id);
      currentTask = extractLastTask(history);
      if (currentTask) taskSource = ' (from conversation)';
    } catch {
      // Leave currentTask unset - fall through to "none" below.
    }
  }

  return {
    text: [
      `ℹ️ Status for: ${status.projectName}`,
      '',
      `State: ${status.status || 'unknown'}`,
      `Current File: ${status.activeFile || 'none'}`,
      `Current Task${taskSource}: ${currentTask || 'none'}`,
      `Elapsed Time: ${status.timeRunning || 'unknown'}`,
      `CPU Usage: ${status.cpuUsage || 'unknown'}`,
      `Memory Usage: ${status.memoryUsage || 'unknown'}`,
      `Window Title: ${status.windowTitle || 'none'}`,
      `Current Branch: ${branch}`
    ].join('\n'),
    sessionId: session.id
  };
}

