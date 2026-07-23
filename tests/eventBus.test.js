import test from 'node:test';
import assert from 'node:assert/strict';
import { EventBus, EVENT_TYPES } from '../core/eventBus.js';

const logger = { debug() {}, info() {}, warn() {}, error() {} };

test('EventBus publishes to type-specific subscribers with a stamped timestamp', () => {
  const bus = new EventBus({ logger });
  const received = [];
  bus.subscribe(EVENT_TYPES.TASK_STARTED, (event) => received.push(event));

  const published = bus.publish(EVENT_TYPES.TASK_STARTED, { session: { id: '1' } });

  assert.equal(received.length, 1);
  assert.equal(received[0].type, EVENT_TYPES.TASK_STARTED);
  assert.equal(received[0].session.id, '1');
  assert.ok(received[0].timestamp);
  assert.equal(published, received[0]);
});

test('EventBus subscribeAll receives every published event type', () => {
  const bus = new EventBus({ logger });
  const seen = [];
  bus.subscribeAll((event) => seen.push(event.type));

  bus.publish(EVENT_TYPES.FILE_EDITED, {});
  bus.publish(EVENT_TYPES.TASK_COMPLETED, {});

  assert.deepEqual(seen, [EVENT_TYPES.FILE_EDITED, EVENT_TYPES.TASK_COMPLETED]);
});

test('EventBus rejects unknown event types', () => {
  const bus = new EventBus({ logger });
  assert.throws(() => bus.publish('NOT_A_REAL_EVENT', {}), /Unknown event type/);
});

test('subscribe() returns an unsubscribe function', () => {
  const bus = new EventBus({ logger });
  const received = [];
  const unsubscribe = bus.subscribe(EVENT_TYPES.TASK_FAILED, (event) => received.push(event));

  bus.publish(EVENT_TYPES.TASK_FAILED, {});
  unsubscribe();
  bus.publish(EVENT_TYPES.TASK_FAILED, {});

  assert.equal(received.length, 1);
});
