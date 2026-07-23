import test from 'node:test';
import assert from 'node:assert/strict';
import { Events } from 'discord.js';
import DiscordMessengerPlugin from '../plugins/messengers/discord.js';

function createMockChannel(sent, edited) {
  return {
    send: async (payload) => {
      const id = `msg-${sent.length + 1}`;
      sent.push({ id, payload });
      return { id };
    },
    messages: {
      fetch: async (messageId) => ({
        id: messageId,
        edit: async (payload) => edited.push({ messageId, payload })
      })
    }
  };
}

function createMockClient({ sent, edited }) {
  const listeners = {};
  return {
    application: { id: 'app-123' },
    on(event, handler) {
      (listeners[event] ||= []).push(handler);
    },
    once(event, handler) {
      (listeners[event] ||= []).push(handler);
    },
    async login(token) {
      this.token = token;
      for (const handler of listeners[Events.ClientReady] || []) handler();
      return token;
    },
    async destroy() {
      this.destroyed = true;
    },
    channels: {
      fetch: async () => createMockChannel(sent, edited)
    }
  };
}

class MockRest {
  constructor() {
    this.calls = [];
  }
  setToken(token) {
    this.token = token;
    return this;
  }
  async put(route, opts) {
    this.calls.push({ route, body: opts.body });
    return opts.body;
  }
}

const logger = { debug() {}, info() {}, warn() {}, error() {} };

function buildConfig(overrides = {}) {
  return {
    messengers: {
      discord: {
        enabled: true,
        botToken: 'test-token',
        guildId: 'guild-1',
        channelId: 'channel-1',
        ...overrides
      }
    }
  };
}

function createStorage(initialState = {}) {
  let state = { ...initialState };
  return {
    getState: () => ({ ...state }),
    setState: async (patch) => {
      state = { ...state, ...patch };
    }
  };
}

test('DiscordMessenger connects, logs in, and registers slash commands', async () => {
  const sent = [];
  const edited = [];
  let restInstance;
  const RestClass = class extends MockRest {
    constructor(...args) {
      super(...args);
      restInstance = this;
    }
  };

  const messenger = new DiscordMessengerPlugin({
    config: buildConfig(),
    logger,
    router: { handle: async () => ({ text: 'ok' }) },
    sessionManager: { getAllSessions: () => [], sessions: new Map(), getActiveSession: () => null },
    storage: createStorage(),
    ClientClass: function (opts) { return createMockClient({ sent, edited }); },
    RestClass
  });

  await messenger.connect();

  assert.equal(messenger.isReady(), true);
  assert.equal(restInstance.calls.length, 1);
  assert.ok(restInstance.calls[0].body.some((cmd) => cmd.name === 'status'));
  assert.ok(restInstance.calls[0].body.some((cmd) => cmd.name === 'diff'));

  await messenger.disconnect();
  assert.equal(messenger.isReady(), false);
});

test('DiscordMessenger sendMessage and editMessage operate on the resolved channel', async () => {
  const sent = [];
  const edited = [];

  const messenger = new DiscordMessengerPlugin({
    config: buildConfig(),
    logger,
    router: {},
    sessionManager: { getAllSessions: () => [], sessions: new Map(), getActiveSession: () => null },
    storage: createStorage(),
    ClientClass: function () { return createMockClient({ sent, edited }); },
    RestClass: MockRest
  });
  await messenger.connect();

  const { messageId } = await messenger.sendMessage({ channelId: 'channel-1' }, 'hello world');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].payload.content, 'hello world');

  await messenger.editMessage({ channelId: 'channel-1' }, messageId, 'updated text');
  assert.equal(edited.length, 1);
  assert.equal(edited[0].payload.content, 'updated text');
});

test('DiscordMessenger Mission Control embed is edited in place, not resent', async () => {
  const sent = [];
  const edited = [];
  const storage = createStorage();

  const messenger = new DiscordMessengerPlugin({
    config: buildConfig(),
    logger,
    router: {},
    sessionManager: { getAllSessions: () => [], sessions: new Map(), getActiveSession: () => null },
    storage,
    ClientClass: function () { return createMockClient({ sent, edited }); },
    RestClass: MockRest
  });
  await messenger.connect();

  const session = { id: 'sess-1', projectName: 'Maxwell', status: 'Running', currentTask: 'Building auth' };

  await messenger.notify({ type: 'running', session, text: 'started' });
  assert.equal(sent.length, 1, 'first notify sends a new Mission Control message');

  await messenger.notify({ type: 'progress', session, text: 'still working' });
  assert.equal(sent.length, 1, 'second notify must not send a new message');
  assert.equal(edited.length, 1, 'second notify edits the existing Mission Control message');

  const ref = storage.getState().discordMissionControl['sess-1'];
  assert.equal(ref.messageId, sent[0].id);
});

test('DiscordMessenger sends a distinct approval card with Approve/Reject/View Diff buttons', async () => {
  const sent = [];
  const edited = [];

  const messenger = new DiscordMessengerPlugin({
    config: buildConfig(),
    logger,
    router: {},
    sessionManager: { getAllSessions: () => [], sessions: new Map(), getActiveSession: () => null },
    storage: createStorage(),
    ClientClass: function () { return createMockClient({ sent, edited }); },
    RestClass: MockRest
  });
  await messenger.connect();

  const session = { id: 'sess-2', projectName: 'Chemwest', status: 'Approval Required' };
  await messenger.notify({
    type: 'approval-required',
    session,
    approval: { command: 'npm install sharp' },
    text: 'approval needed'
  });

  // One Mission Control embed + one approval card.
  assert.equal(sent.length, 2);
  const approvalCard = sent[1].payload;
  assert.ok(approvalCard.embeds);
  const buttons = approvalCard.components[0].components.map((b) => b.data.custom_id);
  assert.deepEqual(buttons, ['approve:sess-2', 'reject:sess-2', 'diff:sess-2']);
});
