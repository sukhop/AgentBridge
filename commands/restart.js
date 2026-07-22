export async function restartCommand({ controllers, sessionManager, command }) {
  let session = sessionManager.getActiveSession();
  if (command.args?.trim()) {
    const target = command.args.trim().toLowerCase();
    const found = sessionManager.getAllSessions().find(
      (s) => s.projectName.toLowerCase() === target || s.id === target
    );
    if (!found) return `Project "${command.args}" not found.`;
    session = found;
  }
  if (!session) return 'No active session.';
  const result = await controllers.antigravity.restart(session.id);
  return {
    text: result.replayedPrompt
      ? `Agent restarted and last prompt replayed for ${session.projectName}`
      : `Agent restarted for ${session.projectName}`,
    sessionId: session.id
  };
}
