export async function promptCommand({ command, controllers, sessionManager }) {
  const session = sessionManager.getActiveSession();
  if (!session) return 'No active session.';
  await controllers.antigravity.sendPrompt(session.id, command.args);
  return { text: `Prompt Sent to ${session.projectName}`, sessionId: session.id };
}
