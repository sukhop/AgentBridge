# AgentBridge

AgentBridge is a modular, open-source platform that bridges AI coding agents (such as Antigravity, Cursor, Claude Code, and Codex CLI) with messaging applications (such as Telegram, with future-ready support for Discord, Slack, and Microsoft Teams). It allows you to monitor, control, approve, and interact with multiple running agent workspaces concurrently from your phone or messenger client.

---

## Key Features

1. **Multi-Agent Adapters**: Includes built-in support for **Antigravity**, **Cursor**, **Claude Code**, and **Codex CLI**.
2. **Multi-Workspace Sessions**: Track and switch between multiple running project folders simultaneously.
3. **Dynamic Plugin Loader**: Automatically discovers and registers adapter and messenger plugins from the `plugins/` directory.
4. **Configuration Wizard**: Set up the application in seconds using the interactive `agentbridge init` command.
5. **Interactive Controls**: Supports sending prompts, approvals, rejections, screenshot captures, terminal copy, and git commands.

---

## Directory Structure

```text
agentbridge/
├── bin/
│   └── agentbridge.js        # CLI Binary Executable
├── core/
│   ├── pluginLoader.js       # Dynamic Plugin Scanner
│   ├── sessionManager.js     # Multi-Session Controller
│   └── workspaceManager.js   # Project Workspace Registry
├── interfaces/
│   ├── adapter.js            # Base Adapter Interface
│   └── messenger.js          # Base Messenger Interface
├── plugins/
│   ├── adapters/             # Agent Adapters (Antigravity, Cursor, etc.)
│   └── messengers/           # Messengers (Telegram, etc.)
├── utils/
│   ├── config.js             # config.yaml Parser
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

3. **Start the Platform**:
   ```bash
   npm start
   ```

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
Custom messengers must be placed in `plugins/messengers/<messenger_name>.js` and extend the `BaseMessenger` interface:

```javascript
import { BaseMessenger } from '../../interfaces/messenger.js';

export default class CustomMessenger extends BaseMessenger {
  constructor(opts) {
    super(opts);
  }

  async start() {
    // Start listening/polling/webhook logic...
  }

  async stop() {
    // Clean up connections...
  }

  async sendNotification(event) {
    // Push real-time status/approval cards to the user...
  }

  async sendResponse(chatId, response) {
    // Send message response...
  }
}
```
