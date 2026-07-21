export async function restartCommand({ controllers, sessionManager }) {
  const session = sessionManager.getActiveSession();
  if (!session) return 'No active session.';
  const result = await controllers.antigravity.restart(session.id);
  return result.replayedPrompt
    ? `Agent restarted and last prompt replayed for ${session.projectName}`
    : `Agent restarted for ${session.projectName}`;
}
