// Contract every messenger plugin (Telegram, Discord, and future Slack/
// Teams/Web) must implement. A `target` is the generic addressing object
// `{ channelId, threadId? }` - Telegram maps `channelId` to its chat id and
// ignores `threadId`; Discord maps it to a real channel/thread id.
export class BaseMessenger {
  constructor({ config, logger, authService, router, sessionManager, notificationService, eventBus, storage }) {
    this.config = config;
    this.logger = logger;
    this.authService = authService;
    this.router = router;
    this.sessionManager = sessionManager;
    this.notificationService = notificationService;
    this.eventBus = eventBus;
    this.storage = storage;
  }

  // Establish the connection (login, start polling/gateway, register commands).
  async connect() {
    throw new Error('Not implemented');
  }

  // Tear the connection down cleanly.
  async disconnect() {
    throw new Error('Not implemented');
  }

  // Send a new message. Returns { messageId } so callers can editMessage() it later.
  async sendMessage(target, content) {
    throw new Error('Not implemented');
  }

  // Edit a previously sent message in place (used by Mission Control embeds).
  async editMessage(target, messageId, content) {
    throw new Error('Not implemented');
  }

  // Send an image (e.g. a screenshot) from a local file path.
  async sendImage(target, imagePath, caption) {
    throw new Error('Not implemented');
  }

  // Send an arbitrary file (e.g. terminal/history dumps) from a local file path.
  async sendFile(target, filePath, caption) {
    throw new Error('Not implemented');
  }

  // Send a message with action buttons. `buttons` is
  // [{ label, action, style? }][] (rows), `action` becomes the callback
  // data / custom id routed back through receiveCommands().
  async sendButtons(target, content, buttons) {
    throw new Error('Not implemented');
  }

  // Send a message with a single-select dropdown.
  // `options` is [{ label, value, description? }].
  async sendSelectMenu(target, content, options, placeholder) {
    throw new Error('Not implemented');
  }

  // Register the platform's native command list (Discord slash commands,
  // Telegram's setMyCommands). `commands` is [{ name, description }].
  async registerCommands(commands) {
    throw new Error('Not implemented');
  }

  // Wire native input (messages, slash commands, button/select
  // interactions) to a single normalized handler:
  // handler({ text, sender, target, meta }) -> Promise<CommandResponse>
  receiveCommands(handler) {
    throw new Error('Not implemented');
  }

  // Render a structured agent event (from NotificationService/eventBus) in
  // this messenger's native format - e.g. an updated Mission Control embed
  // for Discord, a formatted text+keyboard push for Telegram.
  async notify(event) {
    throw new Error('Not implemented');
  }
}
