# Contributing to AgentBridge

We welcome contributions of all types! Whether you are writing custom adapters, messenger plugins, fixing bugs, or improving documentation, your help is highly appreciated.

## Getting Started

1. **Fork** the repository on GitHub.
2. **Clone** your fork locally:
   ```bash
   git clone https://github.com/your-username/AgentBridge.git
   cd AgentBridge
   ```
3. **Install dependencies**:
   ```bash
   npm install
   ```
4. **Run the tests** to make sure everything works:
   ```bash
   npm test
   ```

## Development Guidelines

- **Code Style**: We use ES Modules (ESM) syntax. Please use clean imports and maintain decoupling between core systems, adapters, and messengers.
- **Testing**: Every new feature, adapter, or messenger should include matching unit or integration tests under the `tests/` directory.
- **Linting**: Before submitting a PR, run the syntax linter to verify code correctness:
   ```bash
   npm run lint
   ```

## Submitting Pull Requests

1. Create a descriptive branch for your changes:
   ```bash
   git checkout -b feature/my-cool-adapter
   ```
2. Commit your changes and push them to your fork:
   ```bash
   git push origin feature/my-cool-adapter
   ```
3. Open a Pull Request on the main repository and describe your changes.
