import path from 'node:path';

export class SessionManager {
  constructor({ config, logger, storage, workspaceManager, pluginLoader }) {
    this.config = config;
    this.logger = logger;
    this.storage = storage;
    this.workspaceManager = workspaceManager;
    this.pluginLoader = pluginLoader;
    this.sessions = new Map(); // id -> session object
    this.adapterInstances = new Map(); // name -> instance
    this.activeSessionId = null;
    this.timer = null;
  }

  getAdapterInstance(name) {
    const key = name.toLowerCase();
    if (this.adapterInstances.has(key)) {
      return this.adapterInstances.get(key);
    }
    const AdapterClass = this.pluginLoader.adapters.get(key);
    if (!AdapterClass) {
      throw new Error(`Adapter "${name}" is not loaded.`);
    }
    const instance = new AdapterClass({ config: this.config, logger: this.logger });
    this.adapterInstances.set(key, instance);
    return instance;
  }

  async init() {
    const state = this.storage.getState();
    if (state.sessions) {
      for (const [id, s] of Object.entries(state.sessions)) {
        this.sessions.set(id, {
          ...s,
          conversationHistory: s.conversationHistory || [],
          promptHistory: s.promptHistory || [],
          taskHistory: s.taskHistory || [],
          errors: s.errors || []
        });
      }
    }
    this.activeSessionId = state.activeSessionId || null;
    await this.updateSessions();
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.updateSessions().catch((err) => {
        this.logger.warn('Session manager auto-update failed', { error: err.message });
      });
    }, this.config.monitor?.intervalMs || 5000);
    this.timer.unref?.();
    this.logger.info('SessionManager auto-update started');
  }

  stop() {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
    this.logger.info('SessionManager auto-update stopped');
  }

  async updateSessions() {
    this.logger.debug('SessionManager updateSessions() starting window discovery...');
    const discoveredWindows = [];
    for (const [name] of this.pluginLoader.adapters.entries()) {
      try {
        const adapter = this.getAdapterInstance(name);
        if (typeof adapter.discoverWindows === 'function') {
          const windows = await adapter.discoverWindows();
          for (const win of windows) {
            discoveredWindows.push({ ...win, agentType: name });
          }
        }
      } catch (error) {
        this.logger.warn(`Window discovery failed for adapter: ${name}`, { error: error.message });
      }
    }

    const discoveredIds = new Set();
    const workspaces = this.workspaceManager.listWorkspaces();

    for (const win of discoveredWindows) {
      const id = String(win.WindowHandle);
      discoveredIds.add(id);

      let matchedWorkspace = workspaces.find((ws) => {
        if (win.ExecutablePath && ws.path.toLowerCase() === path.dirname(win.ExecutablePath).toLowerCase()) return true;
        if (win.WindowTitle.toLowerCase().includes(ws.name.toLowerCase())) return true;
        return false;
      });

      if (!matchedWorkspace) {
        const name = win.WindowTitle.split(' - ')[0] || win.ProcessName || 'AutoProject';
        const projectPath = win.ExecutablePath ? path.dirname(win.ExecutablePath) : `C:\\Projects\\${name}`;
        matchedWorkspace = await this.workspaceManager.addWorkspace(name, projectPath, win.agentType);
      }

      const offlineId = `offline-${matchedWorkspace.name.toLowerCase()}`;
      if (this.sessions.has(offlineId)) {
        this.sessions.delete(offlineId);
      }

      if (!this.sessions.has(id)) {
        const session = {
          id,
          projectName: matchedWorkspace.name,
          projectPath: matchedWorkspace.path,
          agentType: win.agentType,
          processId: win.PID,
          windowHandle: win.WindowHandle,
          windowTitle: win.WindowTitle,
          status: 'Idle',
          lastActivity: new Date().toISOString(),
          lastPrompt: '',
          currentTask: '',
          approvalPending: false,
          activeFile: '',
          conversationHistory: [],
          promptHistory: [],
          taskHistory: [],
          errors: [],
          startedAt: new Date().toISOString()
        };
        this.sessions.set(id, session);
        this.logger.info('Registered new agent session', { id, project: matchedWorkspace.name, agentType: win.agentType });
      } else {
        const session = this.sessions.get(id);
        session.windowTitle = win.WindowTitle;
        session.processId = win.PID;
        if (session.status === 'Closed') {
          session.status = 'Idle';
          session.lastActivity = new Date().toISOString();
        }
      }
    }

    for (const [id, session] of this.sessions.entries()) {
      if (!id.startsWith('offline-') && !discoveredIds.has(id) && session.status !== 'Closed') {
        session.status = 'Closed';
        this.logger.info('Agent session closed', { id, project: session.projectName });
      }
    }

    const activeSessions = Array.from(this.sessions.values());
    for (const ws of workspaces) {
      const hasActiveSession = activeSessions.some(
        (s) => s.projectName.toLowerCase() === ws.name.toLowerCase() && s.status !== 'Closed'
      );
      if (!hasActiveSession) {
        const offlineId = `offline-${ws.name.toLowerCase()}`;
        if (!this.sessions.has(offlineId)) {
          this.sessions.set(offlineId, {
            id: offlineId,
            projectName: ws.name,
            projectPath: ws.path,
            agentType: ws.agentType,
            status: 'Closed',
            lastActivity: new Date().toISOString(),
            lastPrompt: '',
            currentTask: '',
            approvalPending: false,
            activeFile: '',
            conversationHistory: [],
            promptHistory: [],
            taskHistory: [],
            errors: []
          });
        }
      }
    }

    const active = this.getActiveSession();
    if (!active || active.status === 'Closed') {
      const live = Array.from(this.sessions.values()).find((s) => s.status !== 'Closed');
      if (live) {
        this.activeSessionId = live.id;
        this.logger.info('Auto-selected active session', { id: live.id, project: live.projectName });
      }
    }

    await this.persist();
  }

  getActiveSession() {
    if (!this.activeSessionId) return null;
    return this.sessions.get(this.activeSessionId) || null;
  }

  async setActiveSession(id) {
    const session = this.sessions.get(id);
    if (!session) {
      throw new Error(`Session ${id} not found.`);
    }
    this.activeSessionId = id;
    await this.persist();
  }

  getAllSessions() {
    return Array.from(this.sessions.values());
  }

  async updateSessionState(id, patch) {
    this.logger.debug('SessionManager updating session state', { id, patch });
    const session = this.sessions.get(id);
    if (!session) return;
    Object.assign(session, patch);
    session.lastActivity = new Date().toISOString();
    await this.persist();
  }

  async persist() {
    this.logger.debug('SessionManager persisting state to storage', { sessionCount: this.sessions.size, activeSessionId: this.activeSessionId });
    await this.storage.setState({
      sessions: Object.fromEntries(this.sessions),
      activeSessionId: this.activeSessionId
    });
  }

  async openProject(projectPath, agentType) {
    const type = (agentType || 'antigravity').toLowerCase();
    const adapter = this.getAdapterInstance(type);
    if (typeof adapter.launch !== 'function') {
      throw new Error(`Adapter ${type} does not support launching.`);
    }

    const resolvedPath = projectPath.trim();

    // Register the workspace up front using the exact path the caller gave us,
    // so window-title matching in updateSessions() has a real name/path to
    // match against instead of guessing one from the newly discovered window.
    if (!this.workspaceManager.getWorkspace(resolvedPath)) {
      const name = path.basename(resolvedPath) || 'Project';
      await this.workspaceManager.addWorkspace(name, resolvedPath, type);
    }

    await adapter.launch(resolvedPath);
    await new Promise((resolve) => setTimeout(resolve, 3000));
    await this.updateSessions();

    const matching = Array.from(this.sessions.values()).find(
      (s) => s.status !== 'Closed' && s.projectPath.toLowerCase() === resolvedPath.toLowerCase()
    );
    if (matching) {
      this.activeSessionId = matching.id;
      await this.persist();
    }
    return matching || null;
  }
}
