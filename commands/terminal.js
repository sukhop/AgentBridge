export async function terminalCommand({ controllers, sessionManager }) {
  const session = sessionManager.getActiveSession();
  if (!session) return 'No active session.';
  const output = await controllers.antigravity.getTerminalOutput(session.id);
  if (!output) return 'Terminal output is empty.';
  if (output.length > 3500) {
    return {
      text: `Terminal output for ${session.projectName} attached.`,
      fileName: 'terminal-output.txt',
      fileText: output,
      sessionId: session.id
    };
  }
  return { text: `Terminal output for ${session.projectName}:\n\n${output}`, sessionId: session.id };
}
