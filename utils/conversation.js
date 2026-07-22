export function extractLastTask(history, maxLength = 300) {
  if (!history) return null;
  const lines = history.split('\n').map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return null;
  const tail = lines.slice(-6).join(' ');
  return tail.length > maxLength ? `${tail.slice(0, maxLength)}…` : tail;
}
