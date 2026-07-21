export async function commitCommand({ command, controllers, sessionManager }) {
  const session = sessionManager.getActiveSession();
  if (!session) return 'No active session.';
  const result = await controllers.git.commit(session, command.args);
  return result.output || (result.committed ? `Committed changes for ${session.projectName}.` : 'No changes to commit.');
}
