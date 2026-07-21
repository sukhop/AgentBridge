export async function promptCommand({ command, controllers, sessionManager }) {
  const session = sessionManager.getActiveSession();
  if (!session) return 'No active session.';
  await controllers.antigravity.sendPrompt(session.id, command.args);
  return `Prompt Sent to ${session.projectName}`;
}
