import { execFile, exec } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);

export class GitController {
  constructor({ config, logger }) {
    this.config = config;
    this.logger = logger;
    this.defaultCwd = config.rootDir;
  }

  async branch(session) {
    const cwd = session?.projectPath || this.defaultCwd;
    const [current, status, branches] = await Promise.all([
      this.git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']),
      this.git(cwd, ['status', '--short']),
      this.git(cwd, ['branch', '--sort=-committerdate'])
    ]);

    return {
      current: current.trim(),
      status: status.trim(),
      branches: branches.trim()
    };
  }

  async commit(session, message) {
    const cwd = session?.projectPath || this.defaultCwd;
    if (!message?.trim()) {
      const error = new Error('Usage: /commit <message>');
      error.expose = true;
      throw error;
    }

    const status = await this.git(cwd, ['status', '--short']);
    if (!status.trim()) {
      return { committed: false, output: 'No changes to commit.' };
    }

    await this.git(cwd, ['add', '-A']);
    const output = await this.git(cwd, ['commit', '-m', message.trim()]);
    return { committed: true, output };
  }

  async push(session) {
    const cwd = session?.projectPath || this.defaultCwd;
    return this.git(cwd, ['push']);
  }

  async diff(session) {
    const cwd = session?.projectPath || this.defaultCwd;
    const [unstaged, staged] = await Promise.all([
      this.git(cwd, ['diff']),
      this.git(cwd, ['diff', '--cached'])
    ]);
    const combined = [
      staged.trim() ? `# Staged changes\n${staged.trim()}` : '',
      unstaged.trim() ? `# Unstaged changes\n${unstaged.trim()}` : ''
    ].filter(Boolean).join('\n\n');
    return combined || null;
  }

  async deploy(session) {
    const cwd = session?.projectPath || this.defaultCwd;
    if (!this.config.deployCommand) {
      const error = new Error('DEPLOY_COMMAND is not configured.');
      error.expose = true;
      throw error;
    }

    const { stdout, stderr } = await execAsync(this.config.deployCommand, {
      cwd,
      timeout: 10 * 60 * 1000,
      maxBuffer: 1024 * 1024
    });

    return [stdout, stderr].filter(Boolean).join('\n').trim() || 'Deploy command completed.';
  }

  async git(cwd, args) {
    try {
      const { stdout, stderr } = await execFileAsync('git', args, {
        cwd,
        timeout: 120000,
        maxBuffer: 1024 * 1024
      });
      return [stdout, stderr].filter(Boolean).join('\n');
    } catch (error) {
      this.logger.error('Git command failed', {
        cwd,
        args,
        stdout: error.stdout,
        stderr: error.stderr,
        message: error.message
      });
      const exposed = new Error((error.stderr || error.stdout || error.message).trim());
      exposed.expose = true;
      throw exposed;
    }
  }
}
