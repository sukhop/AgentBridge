export async function rejectCommand({ controllers, sessionManager, command }) {
  let targetSessionId = command.args?.trim();
  if (!targetSessionId) {
    const session = sessionManager.getActiveSession();
    if (!session) return 'No active session.';
    targetSessionId = session.id;
  }
  const session = sessionManager.sessions.get(targetSessionId);
  if (!session) return `Session ${targetSessionId} not found.`;
  const result = await controllers.antigravity.reject(session.id);
  return `Rejected ${session.projectName} (${result.strategy})`;
}
