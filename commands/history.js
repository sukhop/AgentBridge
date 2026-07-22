export async function historyCommand({ controllers, sessionManager }) {
  const session = sessionManager.getActiveSession();
  if (!session) return 'No active session.';
  const history = await controllers.antigravity.getConversationHistory(session.id);
  if (!history) return 'Conversation history is empty.';
  if (history.length > 3500) {
    return {
      text: `Conversation history for ${session.projectName} attached.`,
      fileName: 'conversation-history.txt',
      fileText: history,
      sessionId: session.id
    };
  }
  return { text: `Conversation history for ${session.projectName}:\n\n${history}`, sessionId: session.id };
}
