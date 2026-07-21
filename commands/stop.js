export async function stopCommand({ controllers, sessionManager }) {
  const session = sessionManager.getActiveSession();
  if (!session) return 'No active session.';
  await controllers.antigravity.stop(session.id);
  return `Agent stopped for ${session.projectName}`;
}
