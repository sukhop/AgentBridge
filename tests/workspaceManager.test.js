import test from 'node:test';
import assert from 'node:assert/strict';
import { WorkspaceManager } from '../core/workspaceManager.js';

test('WorkspaceManager adds, list, matches, and removes workspaces', async () => {
  let savedState = {};
  const storage = {
    getState() {
      return savedState;
    },
    async setState(patch) {
      savedState = { ...savedState, ...patch };
    }
  };

  const logger = {
    info() {},
    warn() {},
    debug() {}
  };

  const manager = new WorkspaceManager({ storage, logger });
  await manager.init();

  assert.equal(manager.listWorkspaces().length, 0);

  const ws = await manager.addWorkspace('Maxwell', 'C:\\Projects\\Maxwell', 'antigravity');
  assert.equal(ws.name, 'Maxwell');
  assert.equal(ws.path, 'C:\\Projects\\Maxwell');
  assert.equal(ws.agentType, 'antigravity');

  assert.equal(manager.listWorkspaces().length, 1);

  const matchByName = manager.getWorkspace('Maxwell');
  const matchByPath = manager.getWorkspace('C:\\Projects\\Maxwell');
  assert.ok(matchByName);
  assert.ok(matchByPath);
  assert.equal(matchByName.name, 'Maxwell');

  const removed = await manager.removeWorkspace('C:\\Projects\\Maxwell');
  assert.ok(removed);
  assert.equal(manager.listWorkspaces().length, 0);
});
