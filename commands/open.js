export async function openCommand({ command, sessionManager }) {
  const projectPath = command.args?.trim();
  if (!projectPath) {
    return 'Usage: /open <project_path>';
  }

  try {
    const session = await sessionManager.openProject(projectPath);
    if (!session) {
      return `Could not detect running Antigravity instance for project at "${projectPath}".`;
    }
    return {
      text: `Opened project and registered session:\n\n📂 Project: ${session.projectName}\n🟢 Status: ${session.status}`,
      sessionId: session.id
    };
  } catch (error) {
    return `Failed to open project: ${error.message}`;
  }
}
