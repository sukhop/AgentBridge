export async function commitCommand({ command, controllers, sessionManager }) {
  const session = sessionManager.getActiveSession();
  if (!session) return 'No active session.';
  const result = await controllers.git.commit(session, command.args);
  const text = result.output || (result.committed ? `Committed changes for ${session.projectName}.` : 'No changes to commit.');
  return { text, sessionId: session.id };
}
