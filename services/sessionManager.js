import path from 'node:path';
import { spawn } from 'node:child_process';

export class SessionManager {
  constructor({ config, logger, storage, locator }) {
    this.config = config;
    this.logger = logger;
    this.storage = storage;
    this.locator = locator;
    this.sessions = new Map(); // id -> session object
    this.activeSessionId = null;
    this.timer = null;
    this.executablePathFallback = config.antigravity?.executablePath || 'antigravity';
  }

  async init() {
    // Load persisted sessions from storage
    const state = this.storage.getState();
    if (state.sessions) {
      for (const [id, s] of Object.entries(state.sessions)) {
        this.sessions.set(id, {
          ...s,
          // Convert lists or history if needed
          conversationHistory: s.conversationHistory || [],
          promptHistory: s.promptHistory || [],
          taskHistory: s.taskHistory || [],
          errors: s.errors || []
        });
      }
    }
    this.activeSessionId = state.activeSessionId || null;

    // Perform initial discovery sync
    await this.updateSessions();
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.updateSessions().catch((error) => {
        this.logger.warn('Session auto-update failed', { error: error.message });
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
    const discovered = await this.locator.getAllAntigravityWindows();
    const discoveredIds = new Set();

    for (const win of discovered) {
      const id = String(win.WindowHandle);
      discoveredIds.add(id);

      // Keep track of the actual executable path to launch new instances
      if (win.ExecutablePath && win.ExecutablePath.toLowerCase().endsWith('.exe')) {
        this.executablePathFallback = win.ExecutablePath;
      }

      if (!this.sessions.has(id)) {
        // Register new session
        const name = inferProjectName(win.WindowTitle, win.ExecutablePath);
        const session = {
          id,
          projectName: name,
          projectPath: win.ExecutablePath ? path.dirname(win.ExecutablePath) : '',
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
        this.logger.info('Registered new Antigravity session', { id, projectName: name });
      } else {
        // Update existing session's transient properties
        const session = this.sessions.get(id);
        session.windowTitle = win.WindowTitle;
        session.processId = win.PID;
        // In case it was closed previously and reopened with same handle
        if (session.status === 'Closed') {
          session.status = 'Idle';
          session.lastActivity = new Date().toISOString();
        }
      }
    }

    // Identify closed sessions
    for (const [id, session] of this.sessions.entries()) {
      if (!discoveredIds.has(id) && session.status !== 'Closed') {
        session.status = 'Closed';
        this.logger.info('Antigravity session closed', { id, projectName: session.projectName });
      }
    }

    // Auto-select active session if none is active or active is closed
    const activeSession = this.getActiveSession();
    if (!activeSession || activeSession.status === 'Closed') {
      const available = Array.from(this.sessions.values()).find((s) => s.status !== 'Closed');
      if (available) {
        this.activeSessionId = available.id;
        this.logger.info('Auto-activated Antigravity session', { id: this.activeSessionId, projectName: available.projectName });
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
    if (!session || session.status === 'Closed') {
      throw new Error(`Session ${id} is not available.`);
    }
    this.activeSessionId = id;
    await this.persist();
    this.logger.info('Switched active session', { id, projectName: session.projectName });
  }

  getAllSessions() {
    return Array.from(this.sessions.values());
  }

  async updateSessionState(id, patch) {
    const session = this.sessions.get(id);
    if (!session) return;
    Object.assign(session, patch);
    session.lastActivity = new Date().toISOString();
    await this.persist();
  }

  async persist() {
    await this.storage.setState({
      sessions: Object.fromEntries(this.sessions),
      activeSessionId: this.activeSessionId
    });
  }

  async openProject(projectPath) {
    if (!projectPath) {
      throw new Error('Project path is required.');
    }

    // Launch new Antigravity instance
    this.logger.info('Launching new Antigravity project instance', { projectPath, executable: this.executablePathFallback });
    const cp = spawn(this.executablePathFallback, [projectPath], {
      detached: true,
      stdio: 'ignore'
    });
    cp.unref();

    // Wait a brief moment for the window to spawn and be detected
    await new Promise((resolve) => setTimeout(resolve, 3000));
    await this.updateSessions();

    // Find the newly registered session matching the project path
    const matching = Array.from(this.sessions.values()).find(
      (s) => s.status !== 'Closed' && s.projectPath.toLowerCase() === projectPath.toLowerCase()
    );

    if (matching) {
      this.activeSessionId = matching.id;
      await this.persist();
      return matching;
    }

    // Fallback: search by name
    const targetName = path.basename(projectPath);
    const matchingByName = Array.from(this.sessions.values()).find(
      (s) => s.status !== 'Closed' && s.projectName.toLowerCase() === targetName.toLowerCase()
    );

    if (matchingByName) {
      this.activeSessionId = matchingByName.id;
      await this.persist();
      return matchingByName;
    }

    return null;
  }
}

export function inferProjectName(title = '', executablePath = '') {
  const titleParts = title.split(' - ').map((p) => p.trim()).filter(Boolean);
  if (titleParts.length >= 3) {
    return titleParts[titleParts.length - 2];
  }
  if (titleParts.length === 2) {
    return titleParts[0];
  }
  if (executablePath) {
    const dir = path.dirname(executablePath);
    const base = path.basename(dir);
    if (base && !['bin', 'contents', 'macos', 'windows', 'dist', 'out'].includes(base.toLowerCase())) {
      return base;
    }
  }
  return title.replace(/Antigravity/gi, '').trim() || 'AntigravityProject';
}
