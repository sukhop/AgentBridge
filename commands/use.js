export async function useCommand({ sessionManager, command }) {
  const target = command.args?.trim();
  if (!target) {
    return 'Usage: /use <project_name_or_session_id>';
  }

  const found = sessionManager.getAllSessions().find(
    (s) => s.projectName.toLowerCase() === target.toLowerCase() || s.id === target
  );

  if (!found) {
    return `Project or session "${target}" not found.`;
  }

  await sessionManager.setActiveSession(found.id);
  return { text: `🟢 Active project is now: ${found.projectName}`, sessionId: found.id };
}
