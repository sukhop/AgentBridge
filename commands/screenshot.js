export async function screenshotCommand({ controllers, sessionManager, command }) {
  let session = sessionManager.getActiveSession();
  if (command.args?.trim()) {
    const target = command.args.trim().toLowerCase();
    const found = sessionManager.getAllSessions().find(
      (s) => s.projectName.toLowerCase() === target || s.id === target
    );
    if (!found) return `Project "${command.args}" not found.`;
    session = found;
  }

  if (!session || session.status === 'Closed') {
    return 'No active or running session found.';
  }

  const mediaPath = await controllers.screenshot.capture(session);
  return {
    text: `Screenshot captured for ${session.projectName}`,
    mediaPath,
    sessionId: session.id
  };
}
