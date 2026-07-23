export async function diffCommand({ controllers, sessionManager, command }) {
  let session = sessionManager.getActiveSession();
  if (command.args?.trim()) {
    const target = command.args.trim().toLowerCase();
    const found = sessionManager.getAllSessions().find(
      (s) => s.projectName.toLowerCase() === target || s.id === target
    );
    if (!found) return `Project "${command.args}" not found.`;
    session = found;
  }

  if (!session) {
    return 'No active session. Use /open <path> to start a project.';
  }

  const diff = await controllers.git.diff(session);
  if (!diff) {
    return { text: `No uncommitted changes for ${session.projectName}.`, sessionId: session.id };
  }

  if (diff.length > 3500) {
    return {
      text: `Diff for ${session.projectName} attached.`,
      fileName: 'diff.patch',
      fileText: diff,
      sessionId: session.id
    };
  }

  return { text: `Diff for ${session.projectName}:\n\n${diff}`, sessionId: session.id };
}
