export async function logsCommand({ storage, sessionManager }) {
  const session = sessionManager.getActiveSession();
  const projectPrefix = session ? `[${session.projectName}] ` : '';
  const events = await storage.latestEvents(10);
  if (!events.length) return 'No logs yet.';

  const output = events.map((event) => {
    const outcome = event.success ? 'ok' : `failed: ${event.failureReason}`;
    return `${event.time} ${event.command} ${outcome} ${event.executionTimeMs}ms`;
  }).join('\n');

  if (output.length > 3500) {
    return {
      text: `${projectPrefix}Latest logs attached.`,
      fileName: 'agremote-logs.txt',
      fileText: output,
      sessionId: session?.id
    };
  }

  return { text: `${projectPrefix}Latest logs:\n\n${output}`, sessionId: session?.id };
}
