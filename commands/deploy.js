export async function deployCommand({ controllers, sessionManager }) {
  const session = sessionManager.getActiveSession();
  if (!session) return 'No active session.';
  const output = await controllers.git.deploy(session);
  return { text: output || `Deploy completed for ${session.projectName}.`, sessionId: session.id };
}
