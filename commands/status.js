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

  // Reading the live conversation panel here has been disabled: the
  // Control+Shift+C -> Control+A -> Control+C hotkey sequence it relies on
  // has twice left a key stuck "held down" on the real desktop, typing
  // garbage into whatever was focused. Re-enable only after that's fixed.
  const currentTask = status.currentTask;
  const taskSource = '';

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

