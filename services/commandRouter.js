export class CommandRouter {
  constructor({ parser, controllers, storage, sessionManager, logger, config }) {
    this.parser = parser;
    this.controllers = controllers;
    this.storage = storage;
    this.sessionManager = sessionManager;
    this.logger = logger;
    this.config = config;
    this.handlers = new Map();
  }

  register(commandName, handler) {
    this.handlers.set(commandName, handler);
  }

  async handle({ text, sender }) {
    this.logger.debug('CommandRouter received input for routing', { text, sender });
    const startedAt = Date.now();
    const command = this.parser.parse(text);
    this.logger.debug('CommandRouter parsed command structure', { commandName: command.name, args: command.args });
    const handler = this.handlers.get(command.name);

    if (!handler) {
      this.logger.debug('CommandRouter failed to find handler for command', { commandName: command.name });
      return {
        text: `Unknown command: ${command.name}\n\nSend help for available commands.`
      };
    }

    try {
      const result = await handler({
        command,
        sender,
        controllers: this.controllers,
        storage: this.storage,
        sessionManager: this.sessionManager,
        logger: this.logger,
        config: this.config
      });
      const executionTimeMs = Date.now() - startedAt;
      await this.storage.logEvent({
        sender,
        command: command.name,
        executionTimeMs,
        success: true
      });
      this.logger.info('Command completed', { sender, command: command.name, executionTimeMs });
      return normalizeResult(result);
    } catch (error) {
      const executionTimeMs = Date.now() - startedAt;
      await this.storage.setState({ lastError: error.message, agentState: 'error' });
      await this.storage.logEvent({
        sender,
        command: command.name,
        executionTimeMs,
        success: false,
        failureReason: error.message
      });
      this.logger.error('Command failed', {
        sender,
        command: command.name,
        executionTimeMs,
        stack: error.stack
      });
      return {
        text: `Sorry, ${command.name} failed: ${friendlyError(error)}`
      };
    }
  }
}

function normalizeResult(result) {
  if (typeof result === 'string') return { text: result };
  return result ?? { text: 'Done.' };
}

function friendlyError(error) {
  if (error.expose) return error.message;
  return 'AGRemote hit an internal error. Check logs for details.';
}
