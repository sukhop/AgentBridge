import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PluginLoader } from '../core/pluginLoader.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

test('PluginLoader scans and registers default plugins', async () => {
  const logger = {
    info() {},
    warn() {},
    debug() {},
    error() {}
  };

  const loader = new PluginLoader({ logger });
  await loader.loadPlugins(path.join(rootDir, 'plugins'));

  assert.ok(loader.adapters.has('antigravity'));
  assert.ok(loader.adapters.has('cursor'));
  assert.ok(loader.adapters.has('claudecode'));
  assert.ok(loader.adapters.has('codexcli'));
  assert.ok(loader.messengers.has('telegram'));
});
