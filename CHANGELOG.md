# Changelog

All notable changes to **@smi0001/agent-chho2** (छोटू) are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/); this project
adheres to [Semantic Versioning](https://semver.org/).

The interactive CLI shows unread entries from this file as **What's New** when you
upgrade (feature H).

## [Unreleased]

### Added
- **claude-agent adapter is live** (milestone 2): `run()` drives Claude through the
  Claude Agent SDK using the subscription token (`CLAUDE_CODE_OAUTH_TOKEN`), reporting
  real token usage and cost. Single text turn, no tools yet (MCP next).
- `agent-chho2 doctor` — validates config + credentials and runs one tiny live turn,
  printing the reply, token usage, cost, and latency.
- `.env` auto-loaded at startup (no dependency); `RunResult` now carries `costUsd`.

### Added (scaffold)
- Project scaffold: TypeScript, ESM, Apache-2.0.
- `ModelProvider` interface with two adapters:
  - `claude-agent` — drives Claude via the Claude Agent SDK using a Claude Code
    subscription token (`CLAUDE_CODE_OAUTH_TOKEN`). No separate API billing.
  - `vercel` — provider-agnostic via the Vercel AI SDK (Anthropic, OpenAI, Gemini,
    local Ollama).
- Declarative **role registry** loading built-in `dev` and `qa` roles from YAML.
- Interactive shell (pick role → pick task) plus non-interactive `roles`, `--help`,
  and `--version`.
- Skeletons for: config loader, JSONL audit logger, three-tier permission policy,
  notifier (email + countdown escalation), and MCP connection manager.

[Unreleased]: https://www.npmjs.com/package/@smi0001/agent-chho2
