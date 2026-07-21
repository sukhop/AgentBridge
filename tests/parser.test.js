import test from 'node:test';
import assert from 'node:assert/strict';
import { Parser } from '../services/parser.js';

test('parses explicit prompt command', () => {
  const parser = new Parser();
  assert.deepEqual(parser.parse('prompt Fix navbar'), {
    name: 'prompt',
    args: 'Fix navbar',
    raw: 'prompt Fix navbar',
    implicit: false
  });
});

test('treats natural language as prompt', () => {
  const parser = new Parser();
  assert.deepEqual(parser.parse('Fix the navbar spacing.'), {
    name: 'prompt',
    args: 'Fix the navbar spacing.',
    raw: 'Fix the navbar spacing.',
    implicit: true
  });
});

test('parses status command', () => {
  const parser = new Parser();
  assert.equal(parser.parse('status').name, 'status');
});
