export async function pushCommand({ controllers, sessionManager }) {
  const session = sessionManager.getActiveSession();
  if (!session) return 'No active session.';
  const output = await controllers.git.push(session);
  return { text: output || `Push completed for ${session.projectName}.`, sessionId: session.id };
}
