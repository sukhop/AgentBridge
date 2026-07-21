export async function sessionsCommand({ sessionManager }) {
  const sessions = sessionManager.getAllSessions();
  if (!sessions.length) {
    return 'No registered projects or sessions found.';
  }

  const activeSession = sessionManager.getActiveSession();
  const listText = sessions.map((s, index) => {
    let statusEmoji = '⚪';
    if (s.status === 'Running') statusEmoji = '🟢';
    else if (s.status === 'Approval Required') statusEmoji = '🟡';
    else if (s.status === 'Closed') statusEmoji = '🔴';
    else if (s.status === 'Stopped') statusEmoji = '⛔';

    const isActive = activeSession && s.id === activeSession.id ? ' ⭐️ (Active)' : '';
    return `${index + 1}️⃣ ${s.projectName}${isActive}\n${statusEmoji} ${s.status}`;
  }).join('\n\n');

  const buttons = sessions
    .map((s) => ({
      text: s.status === 'Closed' ? `📁 Switch to ${s.projectName} (Closed)` : `🟢 Switch to ${s.projectName}`,
      callback_data: `activate:${s.id}`
    }));

  const inline_keyboard = [];
  for (let i = 0; i < buttons.length; i += 2) {
    inline_keyboard.push(buttons.slice(i, i + 2));
  }

  return {
    text: `📂 Antigravity Projects:\n\n${listText}`,
    reply_markup: {
      inline_keyboard
    }
  };
}
