export async function approveCommand({ controllers, sessionManager, command }) {
  let targetSessionId = command.args?.trim();
  if (!targetSessionId) {
    const session = sessionManager.getActiveSession();
    if (!session) return 'No active session.';
    targetSessionId = session.id;
  }
  const session = sessionManager.sessions.get(targetSessionId);
  if (!session) return `Session ${targetSessionId} not found.`;
  const result = await controllers.antigravity.approve(session.id);
  return `Approved ${session.projectName} (${result.strategy})`;
}
