export async function branchCommand({ controllers, sessionManager }) {
  const session = sessionManager.getActiveSession();
  if (!session) return 'No active session.';
  const branch = await controllers.git.branch(session);
  return [
    `Current branch [${session.projectName}]: ${branch.current || 'unknown'}`,
    '',
    'Status:',
    branch.status || 'clean',
    '',
    'Recent branches:',
    branch.branches || 'unknown'
  ].join('\n');
}
