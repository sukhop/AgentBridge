// Renders a workspace's session state into a persistent "Mission Control"
// embed (Discord) or an equivalent text block for messengers without a
// native embed concept. This is the single source of truth for what the
// card looks like, so Discord's live-updated embed and any future consumer
// (web dashboard) render the exact same fields from the exact same data.

const STATUS_COLOR = {
  Running: 0x2ecc71,
  Idle: 0x95a5a6,
  'Approval Required': 0xf1c40f,
  Stopped: 0xe67e22,
  Closed: 0x7f8c8d,
  Rejected: 0xe74c3c,
  Error: 0xe74c3c
};

export const STATUS_EMOJI = {
  Running: '🟢',
  Idle: '⚪',
  'Approval Required': '🟡',
  Stopped: '⛔',
  Closed: '🔴',
  Rejected: '🔴',
  Error: '❌'
};

// There is no real "% complete" signal available from the underlying
// editor/agent - this renders a coarse, state-based indicator (not a
// measured completion percentage) so it's honest about what it represents.
const STATE_PROGRESS_SEGMENTS = {
  Idle: 0,
  Stopped: 0,
  Closed: 0,
  Rejected: 0,
  Error: 0,
  'Approval Required': 7,
  Running: 5,
  Completed: 10,
  Finished: 10
};

export function renderProgressBar(status, segments = 10) {
  const filled = STATE_PROGRESS_SEGMENTS[status] ?? 0;
  return '█'.repeat(filled) + '░'.repeat(Math.max(0, segments - filled));
}

export function buildWorkspaceEmbedFields(session) {
  const status = session.status || 'Unknown';
  return {
    title: `🤖 ${session.projectName}`,
    color: STATUS_COLOR[status] ?? 0x3498db,
    fields: [
      { name: 'Status', value: `${STATUS_EMOJI[status] ?? '⚪'} ${status}`, inline: true },
      { name: 'Progress', value: renderProgressBar(status), inline: true },
      { name: 'Current Task', value: session.currentTask || 'None', inline: false },
      {
        name: 'Files Modified',
        value: (session.filesChanged?.length ? session.filesChanged.map((f) => `✓ ${f}`).join('\n') : 'Not tracked yet'),
        inline: false
      },
      { name: 'Tests', value: session.testsStatus || 'Not tracked', inline: true },
      { name: 'Branch', value: session.currentBranch || 'unknown', inline: true }
    ],
    footer: `Last update: ${new Date().toLocaleTimeString()}`
  };
}

export function renderWorkspaceText(session) {
  const embed = buildWorkspaceEmbedFields(session);
  const lines = [embed.title, ''];
  for (const field of embed.fields) {
    lines.push(`${field.name}: ${field.value}`);
  }
  lines.push('', embed.footer);
  return lines.join('\n');
}
