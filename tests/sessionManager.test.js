import test from 'node:test';
import assert from 'node:assert/strict';
import { SessionManager, inferProjectName } from '../services/sessionManager.js';

test('inferProjectName parses project names correctly', () => {
  assert.equal(inferProjectName('index.js - Maxwell - Antigravity', 'C:\\projects\\maxwell\\index.js'), 'Maxwell');
  assert.equal(inferProjectName('Maxwell - Antigravity', 'C:\\projects\\maxwell\\index.js'), 'Maxwell');
  assert.equal(inferProjectName('Antigravity', 'C:\\projects\\Chemwest\\ag.exe'), 'Chemwest');
  assert.equal(inferProjectName('SomeOtherWindow', ''), 'SomeOtherWindow');
});

test('SessionManager registers, switches, and closes sessions', async () => {
  const config = {
    monitor: { intervalMs: 1000 }
  };
  const logger = {
    info() {},
    warn() {},
    debug() {}
  };
  
  let savedState = {};
  const storage = {
    getState() {
      return savedState;
    },
    async setState(patch) {
      savedState = { ...savedState, ...patch };
    }
  };

  const fakeWindows = [
    {
      PID: 1001,
      WindowHandle: 12345,
      WindowTitle: 'main.py - ProjectAlpha - Antigravity',
      ProcessName: 'Antigravity',
      ExecutablePath: 'C:\\Projects\\Alpha\\Antigravity.exe',
      Bounds: { x: 0, y: 0, width: 800, height: 600 }
    },
    {
      PID: 1002,
      WindowHandle: 67890,
      WindowTitle: 'config.json - ProjectBeta - Antigravity',
      ProcessName: 'Antigravity',
      ExecutablePath: 'C:\\Projects\\Beta\\Antigravity.exe',
      Bounds: { x: 100, y: 100, width: 800, height: 600 }
    }
  ];

  const locator = {
    async getAllAntigravityWindows() {
      return fakeWindows;
    }
  };

  const manager = new SessionManager({ config, logger, storage, locator });
  await manager.init();

  const sessions = manager.getAllSessions();
  assert.equal(sessions.length, 2);

  const alpha = sessions.find((s) => s.projectName === 'ProjectAlpha');
  const beta = sessions.find((s) => s.projectName === 'ProjectBeta');

  assert.ok(alpha);
  assert.ok(beta);
  assert.equal(alpha.processId, 1001);
  assert.equal(beta.windowHandle, 67890);

  // Auto-activate first running session
  assert.equal(manager.activeSessionId, alpha.id);
  assert.equal(manager.getActiveSession().projectName, 'ProjectAlpha');

  // Switch session
  await manager.setActiveSession(beta.id);
  assert.equal(manager.activeSessionId, beta.id);
  assert.equal(manager.getActiveSession().projectName, 'ProjectBeta');

  // Simulate closing Alpha window
  fakeWindows.shift();
  await manager.updateSessions();

  assert.equal(manager.sessions.get(alpha.id).status, 'Closed');
  assert.equal(manager.sessions.get(beta.id).status, 'Idle');

  // Verify closed session is not allowed to be activated
  await assert.rejects(
    async () => {
      await manager.setActiveSession(alpha.id);
    },
    /is not available/
  );
});
