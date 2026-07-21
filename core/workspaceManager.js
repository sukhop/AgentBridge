export class WorkspaceManager {
  constructor({ storage, logger }) {
    this.storage = storage;
    this.logger = logger;
    this.workspaces = new Map(); // path -> workspace object
  }

  async init() {
    const state = this.storage.getState();
    if (state.workspaces) {
      for (const [path, ws] of Object.entries(state.workspaces)) {
        this.workspaces.set(path, ws);
      }
    }
  }

  async addWorkspace(name, projectPath, agentType) {
    if (!name || !projectPath || !agentType) {
      throw new Error('Name, path, and agent type are required.');
    }
    const resolvedPath = projectPath.trim();
    this.workspaces.set(resolvedPath, {
      name: name.trim(),
      path: resolvedPath,
      agentType: agentType.trim().toLowerCase(),
      startedAt: new Date().toISOString()
    });
    await this.persist();
    this.logger.info('Added workspace', { name, path: resolvedPath, agentType });
    return this.workspaces.get(resolvedPath);
  }

  async removeWorkspace(projectPath) {
    const resolvedPath = projectPath.trim();
    if (this.workspaces.has(resolvedPath)) {
      this.workspaces.delete(resolvedPath);
      await this.persist();
      this.logger.info('Removed workspace', { path: resolvedPath });
      return true;
    }
    return false;
  }

  getWorkspace(nameOrPath) {
    const target = String(nameOrPath).trim().toLowerCase();
    for (const [path, ws] of this.workspaces.entries()) {
      if (path.toLowerCase() === target || ws.name.toLowerCase() === target) {
        return ws;
      }
    }
    return null;
  }

  listWorkspaces() {
    return Array.from(this.workspaces.values());
  }

  async persist() {
    await this.storage.setState({
      workspaces: Object.fromEntries(this.workspaces)
    });
  }
}
