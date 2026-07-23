import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWorkspaceEmbedFields, renderProgressBar, renderWorkspaceText } from '../services/missionControl.js';

test('renderProgressBar reflects coarse state, not a fabricated percentage', () => {
  assert.equal(renderProgressBar('Idle'), '░░░░░░░░░░');
  assert.equal(renderProgressBar('Running'), '█████░░░░░');
  assert.equal(renderProgressBar('Completed'), '██████████');
  assert.equal(renderProgressBar('UnknownState'), '░░░░░░░░░░');
});

test('buildWorkspaceEmbedFields renders known session fields honestly', () => {
  const session = {
    projectName: 'Maxwell',
    status: 'Running',
    currentTask: 'Building authentication',
    currentBranch: 'main',
    filesChanged: ['auth.js', 'middleware.js'],
    testsStatus: 'Passing'
  };

  const fields = buildWorkspaceEmbedFields(session);

  assert.equal(fields.title, '🤖 Maxwell');
  const byName = Object.fromEntries(fields.fields.map((f) => [f.name, f.value]));
  assert.equal(byName.Status, '🟢 Running');
  assert.equal(byName['Current Task'], 'Building authentication');
  assert.equal(byName['Files Modified'], '✓ auth.js\n✓ middleware.js');
  assert.equal(byName.Tests, 'Passing');
  assert.equal(byName.Branch, 'main');
});

test('buildWorkspaceEmbedFields is honest about untracked data instead of faking it', () => {
  const session = { projectName: 'Chemwest', status: 'Idle' };
  const fields = buildWorkspaceEmbedFields(session);
  const byName = Object.fromEntries(fields.fields.map((f) => [f.name, f.value]));

  assert.equal(byName['Files Modified'], 'Not tracked yet');
  assert.equal(byName.Tests, 'Not tracked');
  assert.equal(byName['Current Task'], 'None');
  assert.equal(byName.Branch, 'unknown');
});

test('renderWorkspaceText produces a plain-text equivalent of the embed', () => {
  const session = { projectName: 'Portfolio', status: 'Stopped' };
  const text = renderWorkspaceText(session);
  assert.match(text, /🤖 Portfolio/);
  assert.match(text, /Status: ⛔ Stopped/);
  assert.match(text, /Last update:/);
});
