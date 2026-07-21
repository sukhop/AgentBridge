export async function resumeCommand({ controllers, sessionManager }) {
  const session = sessionManager.getActiveSession();
  if (!session) return 'No active session.';
  await controllers.antigravity.resume(session.id);
  return `Agent resumed for ${session.projectName}`;
}
