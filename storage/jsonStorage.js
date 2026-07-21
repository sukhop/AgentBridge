import fs from 'node:fs/promises';
import path from 'node:path';

export class JsonStorage {
  constructor({ config, logger }) {
    this.logger = logger;
    this.storageDir = path.join(config.rootDir, 'storage');
    this.eventsFile = path.join(this.storageDir, 'events.jsonl');
    this.stateFile = path.join(this.storageDir, 'state.json');
    this.state = {
      startedAt: new Date().toISOString(),
      lastPrompt: '',
      currentTask: '',
      agentState: 'starting',
      lastError: '',
      currentProject: path.basename(config.rootDir),
      activeFile: ''
    };
  }

  async init() {
    await fs.mkdir(this.storageDir, { recursive: true });
    try {
      const raw = await fs.readFile(this.stateFile, 'utf8');
      this.state = { ...this.state, ...JSON.parse(raw) };
    } catch (error) {
      if (error.code !== 'ENOENT') this.logger.warn('Could not read persisted state', { error });
      await this.saveState();
    }
  }

  async saveState() {
    await fs.writeFile(this.stateFile, JSON.stringify(this.state, null, 2));
  }

  async setState(patch) {
    this.state = { ...this.state, ...patch };
    await this.saveState();
  }

  getState() {
    return { ...this.state };
  }

  async logEvent(event) {
    const record = {
      time: new Date().toISOString(),
      ...event
    };
    await fs.appendFile(this.eventsFile, `${JSON.stringify(record)}\n`);
    return record;
  }

  async latestEvents(limit = 20) {
    try {
      const raw = await fs.readFile(this.eventsFile, 'utf8');
      return raw
        .trim()
        .split('\n')
        .filter(Boolean)
        .slice(-limit)
        .map((line) => JSON.parse(line));
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  }
}
