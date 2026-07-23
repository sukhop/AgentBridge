export async function settingsCommand({ config, sessionManager }) {
  const messengers = Object.entries(config?.messengers || {})
    .map(([name, cfg]) => `${cfg.enabled ? '🟢' : '⚪'} ${name}`)
    .join('\n') || 'none configured';

  const workspaceCount = sessionManager ? sessionManager.getAllSessions().length : 0;

  return {
    text: [
      '⚙️ AgentBridge Settings',
      '',
      'Messengers:',
      messengers,
      '',
      `Monitor interval: ${config?.monitor?.intervalMs ?? 'unknown'}ms`,
      `Progress interval: ${config?.monitor?.progressIntervalMs ?? 'unknown'}ms`,
      `Registered workspaces/sessions: ${workspaceCount}`,
      `Antigravity CDP: ${config?.antigravity?.cdpUrl ? 'configured' : 'not configured'}`
    ].join('\n')
  };
}
