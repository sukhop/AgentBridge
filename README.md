# AgentBridge

AgentBridge is a modular, open-source platform that bridges AI coding agents (such as Antigravity, Cursor, Claude Code, and Codex CLI) with messaging applications. **Telegram** and **Discord** are both first-class, run simultaneously, and share the same underlying event pipeline - Slack, Microsoft Teams, and a web dashboard can be added the same way without touching core logic. It lets you monitor, control, approve, and collaborate on multiple running agent workspaces from your phone, a Discord server, or both at once.

---

## Key Features

1. **Multi-Agent Adapters**: Includes built-in support for **Antigravity**, **Cursor**, **Claude Code**, and **Codex CLI**.
2. **Multi-Workspace Sessions**: Track and switch between multiple running project folders simultaneously.
3. **Multi-Messenger, Simultaneously**: Enable Telegram, Discord, or both - every messenger implements the same `BaseMessenger` interface and receives the same events.
4. **Discord Mission Control**: One persistent, live-edited embed per workspace (status, task, progress, files, tests, branch), plus actionable Approve/Reject/View Diff cards - not a wall of chat spam.
5. **Central Event Bus**: Adapters/services publish structured events (`TASK_STARTED`, `FILE_EDITED`, `APPROVAL_REQUIRED`, ...); messengers subscribe. Adapters never talk to Telegram/Discord directly.
6. **Dynamic Plugin Loader**: Automatically discovers and registers adapter and messenger plugins from the `plugins/` directory.
7. **Configuration Wizard**: Set up the application in seconds using the interactive `agentbridge init` command.
8. **Interactive Controls**: Supports sending prompts, approvals, rejections, screenshot captures, and git commands (branch/commit/push/deploy/diff).

---

## Directory Structure

```text
agentbridge/
├── bin/
│   └── agentbridge.js        # CLI Binary Executable - wires config, sessions, event bus, and every enabled messenger
├── core/
│   ├── eventBus.js           # Central structured-event bus (EVENT_TYPES + publish/subscribe)
│   ├── pluginLoader.js       # Dynamic Plugin Scanner
│   ├── sessionManager.js     # Multi-Session Controller
│   └── workspaceManager.js   # Project Workspace Registry
├── interfaces/
│   ├── adapter.js            # Base Adapter Interface
│   └── messenger.js          # Base Messenger Interface (connect/disconnect/send*/register*/notify)
├── services/
│   ├── missionControl.js     # Renders a session's state into the Discord embed / plain-text equivalent
│   ├── notificationService.js # Polls adapters, detects transitions, publishes events + fan-out notifications
│   └── commandRouter.js      # Parses and dispatches /commands to their handler, shared by every messenger
├── plugins/
│   ├── adapters/             # Agent Adapters (Antigravity, Cursor, etc.)
│   └── messengers/           # Messengers: telegram.js, discord.js
├── utils/
│   ├── config.js             # config.yaml + .env loader (the one bin/agentbridge.js actually uses)
│   └── wizard.js             # CLI Setup Prompt Wizard
└── README.md
```

---

## Setup & Installation

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Initialize Configuration**:
   Run the setup wizard to generate `config.yaml`:
   ```bash
   node bin/agentbridge.js init
   ```
   This will prompt you for:
   - Preferred messenger (e.g. `telegram`)
   - Bot Token / API Credentials
   - Default AI Agent (e.g. `antigravity`)
   - Default project workspace path
   - Notification preferences
   - **Phone pairing**: if you choose to pair now, the wizard waits for you to send any message to your bot in Telegram and automatically saves your chat ID to `.env` — no manual copy/paste or restart required.

3. **Start the Platform**:
   ```bash
   npm start
   ```

---

## Enabling Discord

Discord runs alongside Telegram (or on its own) - both are controlled by `messengers.telegram.enabled` / `messengers.discord.enabled` in `config.yaml`, with secrets only ever in `.env`:

1. **Create a Discord application & bot**: [Discord Developer Portal](https://discord.com/developers/applications) → New Application → Bot tab → Reset/copy the token → under OAuth2 → URL Generator, check `bot` + `applications.commands` scopes and the permissions `Send Messages`, `Embed Links`, `Attach Files`, `Read Message History`, `Use Slash Commands` → open the generated URL to invite it to your server.
2. **Get your Guild ID and Channel ID**: enable Developer Mode in Discord (User Settings → Advanced), then right-click your server → Copy Server ID, and right-click the channel you want Mission Control to live in → Copy Channel ID.
3. **Set `.env`**:
   ```env
   MESSENGER_DISCORD_ENABLED=true
   DISCORD_BOT_TOKEN=your-bot-token
   DISCORD_GUILD_ID=your-guild-id
   DISCORD_CHANNEL_ID=your-channel-id
   ```
4. **Start (or restart) AgentBridge** - it registers all slash commands to that guild on connect (instant availability; global commands can take up to an hour to propagate, which is why a guild ID is used).

### Discord Slash Commands

`/help` `/projects` `/status` `/use` `/prompt` `/screenshot` `/logs` `/history` `/approve` `/reject` `/diff` `/open` `/restart` `/settings`

`/projects` renders a live dropdown to switch the active project. Every reply carries the same contextual buttons as Telegram (Screenshot/Status/Stop/Resume, plus Approve/Reject/View Diff when something is actually pending), scoped to the exact project that reply is about.

### Mission Control

Each workspace gets **one** persistent embed in the configured channel - status, current task, a coarse state-based progress indicator, files modified, tests, and branch. Every update **edits that same message in place**; AgentBridge never spams the channel with a new message per update. The message reference is persisted (`storage/state.json`), so it keeps editing the same embed across restarts.

An approval-required event additionally posts a distinct, actionable card with **Approve / Reject / View Diff** buttons - important moments still get their own visible message, they just don't replace the steady-state embed.

Two fields are honestly reported as **not yet tracked** rather than faked: "Files Modified" (real-time filesystem watching) and "Tests" (a real test-runner integration) aren't wired up yet - see Roadmap below.

---

## Architecture: Event Bus → Messengers

```
Adapter (window/approval/status detection)
    ↓
NotificationService (detects transitions, formats text)
    ↓  publishes structured events               ↘ emits 'notification' for fan-out
core/eventBus.js (EVENT_TYPES: TASK_STARTED,        Telegram.notify(event)
  FILE_EDITED, APPROVAL_REQUIRED, ...)               Discord.notify(event)
    ↓ (future consumers subscribe directly)          ...any other enabled messenger
  Web dashboard / logging / anything else
```

Adapters and NotificationService never import or reference a specific messenger. Every messenger plugin implements the same `BaseMessenger` interface (`interfaces/messenger.js`); `bin/agentbridge.js` instantiates every messenger enabled in `config.messengers.*`, connects each independently (one failing to connect doesn't take the others down), and broadcasts every notification to all of them.

**Roadmap** (adding a messenger doesn't require touching this architecture): per-workspace Discord threads for a live timeline, real-time file-change tracking via filesystem watching, CDP-based (non-keyboard) terminal/conversation streaming, Slack/Microsoft Teams/web-dashboard plugins, and team permissions (workspace ownership, read-only vs admin Discord roles).

---

## Messaging Commands (Telegram)

- `/projects` / `/sessions`: Show all registered projects and their status, with inline buttons to switch active project.
- `/open <path>`: Launch an agent for a project directory and register it as a session.
- `/status [project]`: Get detailed status (CPU, memory, elapsed time, current file, task) of the active or target project.
- `/prompt <text>`: Type and enter a prompt into the focused prompt box of the active project.
- `/screenshot [project]`: Capture a compressed JPEG screenshot of the target project's window.
- `/approve [sessionId]`: Approve the active tool execution or pending command.
- `/reject [sessionId]`: Reject the pending tool execution or stop agent execution.
- `/terminal`: Copy and retrieve terminal console history for the active session.
- `/history`: Copy and retrieve conversation log history.
- `/deploy`: Run the configured project deploy script.
- `/branch`: Show git branch information for the project.
- `/stop [project]`, `/resume [project]`, `/restart [project]`: Control a specific project by name, without needing to switch it to "active" first.

Every reply and notification is scoped to the project it's about: its inline buttons (Screenshot, Status, Stop, Resume) always act on that project's session, never on whichever project happens to be active elsewhere. Approve/Reject only appear when that specific project has a real pending approval — they're hidden otherwise, so you won't see stale action buttons when nothing needs a decision.

While a project is actively running a prompt, you also get periodic "still working" pushes (current file, elapsed time, and the task in progress) instead of silence between the start and completion notifications — fired whenever the current file changes or every `PROGRESS_INTERVAL_MS` (default 30s), whichever comes first.

---

## Creating Custom Plugins

### 1. Custom Adapters
Custom adapters must be placed in `plugins/adapters/<adapter_name>.js` and extend the `BaseAdapter` interface:

```javascript
import { BaseAdapter } from '../../interfaces/adapter.js';

export default class CustomAdapter extends BaseAdapter {
  constructor({ config, logger }) {
    super({ config, logger });
  }

  // Discover and list running windows for this agent
  async discoverWindows() {
    return [
      {
        PID: 1234,
        WindowHandle: 998877,
        WindowTitle: 'MyAgent Workspace',
        ProcessName: 'myagent',
        ExecutablePath: 'C:\\path\\to\\myagent.exe',
        Bounds: { x: 0, y: 0, width: 1024, height: 768 }
      }
    ];
  }

  // Launch a project
  async launch(projectPath) {
    // Spawning implementation...
  }

  // Focus the window
  async focus(session) {
    // Window focus implementation...
  }

  // Type prompt using clipboard
  async typePrompt(session, text) {
    // Clipboard copy-paste automation...
  }

  // Capture window screenshot
  async captureWindow(session) {
    // Screenshot capture implementation...
  }
}
```

### 2. Custom Messengers
Custom messengers must be placed in `plugins/messengers/<messenger_name>.js`, extend `BaseMessenger` (`interfaces/messenger.js`), and get automatically discovered/instantiated once you add an `enabled: true` entry for it under `config.messengers` (see `utils/config.js`). Every messenger owns its own input loop (see how `telegram.js` and `discord.js` each self-contain parsing/dispatch through the shared `router`), and renders `notify(event)` in whatever way fits that platform - a Mission Control embed for Discord, a formatted push for Telegram, etc.

```javascript
import { BaseMessenger } from '../../interfaces/messenger.js';

export default class CustomMessenger extends BaseMessenger {
  constructor(opts) {
    super(opts); // gives you this.config, this.logger, this.router, this.sessionManager, this.storage, this.eventBus

  }

  async connect() {
    // Log in / start polling / open a gateway connection, then wire your
    // native input (messages, slash commands, buttons) to call
    // this.router.handle({ text, sender, meta }) and render the result.
  }

  async disconnect() {
    // Clean up connections...
  }

  async sendMessage(target, content) { /* new message, returns { messageId } */ }
  async editMessage(target, messageId, content) { /* edit in place */ }
  async sendImage(target, imagePath, caption) { /* ... */ }
  async sendFile(target, filePath, caption) { /* ... */ }
  async sendButtons(target, content, buttons) { /* [[{label, action}]] rows */ }
  async sendSelectMenu(target, content, options, placeholder) { /* [{label, value}] */ }
  async registerCommands(commands) { /* native slash-command / command-list registration */ }
  receiveCommands(handler) { /* optional external hook; most messengers self-route via connect() */ }

  async notify(event) {
    // Render a structured event ({ type, session, text, ... } - see
    // core/eventBus.js EVENT_TYPES) into this platform's native format.
  }
}
```
