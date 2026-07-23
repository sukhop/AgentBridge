import { EventEmitter } from 'node:events';

// Structured agent-event vocabulary. Adapters/services publish these onto
// the bus; messengers (and any future consumer - a web dashboard, a log
// sink) subscribe without knowing anything about each other.
export const EVENT_TYPES = Object.freeze({
  TASK_STARTED: 'TASK_STARTED',
  TASK_PROGRESS: 'TASK_PROGRESS',
  TASK_STATUS: 'TASK_STATUS',
  FILE_EDITED: 'FILE_EDITED',
  FILE_CREATED: 'FILE_CREATED',
  FILE_DELETED: 'FILE_DELETED',
  TERMINAL_OUTPUT: 'TERMINAL_OUTPUT',
  TEST_STARTED: 'TEST_STARTED',
  TEST_FINISHED: 'TEST_FINISHED',
  APPROVAL_REQUIRED: 'APPROVAL_REQUIRED',
  APPROVAL_GRANTED: 'APPROVAL_GRANTED',
  APPROVAL_REJECTED: 'APPROVAL_REJECTED',
  SCREENSHOT_AVAILABLE: 'SCREENSHOT_AVAILABLE',
  TASK_COMPLETED: 'TASK_COMPLETED',
  TASK_FAILED: 'TASK_FAILED'
});

const ALL_EVENT_TYPES = new Set(Object.values(EVENT_TYPES));

// Central event bus. Producers (adapters, NotificationService) call
// eventBus.publish(type, payload); consumers (messengers, future web
// dashboard) call eventBus.subscribe(type, handler) or subscribeAll(handler).
// Nothing here knows about Telegram, Discord, or any other transport -
// that's the whole point: adapters never talk to messengers directly.
export class EventBus extends EventEmitter {
  constructor({ logger } = {}) {
    super();
    this.logger = logger;
    this.setMaxListeners(50);
  }

  publish(type, payload = {}) {
    if (!ALL_EVENT_TYPES.has(type)) {
      throw new Error(`Unknown event type: ${type}`);
    }
    const event = { type, timestamp: new Date().toISOString(), ...payload };
    this.logger?.debug('EventBus publish', { type, sessionId: payload.session?.id });
    this.emit(type, event);
    this.emit('*', event);
    return event;
  }

  subscribe(type, handler) {
    this.on(type, handler);
    return () => this.off(type, handler);
  }

  subscribeAll(handler) {
    this.on('*', handler);
    return () => this.off('*', handler);
  }
}
