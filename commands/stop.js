export async function stopCommand({ controllers, sessionManager, command }) {
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
  await controllers.antigravity.stop(session.id);
  return { text: `Agent stopped for ${session.projectName}`, sessionId: session.id };
}
