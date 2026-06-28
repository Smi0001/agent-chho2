# Changelog

All notable changes to **@smi0001/agent-chho2** (छोटू) are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/); this project
adheres to [Semantic Versioning](https://semver.org/).

The interactive CLI shows unread entries from this file as **What's New** when you
upgrade (feature H).

## [Unreleased]

### Added
- **Pinned mcp-remote + `troubleshoot` command** (milestone 2): the Atlassian
  capability now pins `mcp-remote` to an exact version (`MCP_REMOTE_VERSION`) for a
  stable auth cache and reproducible runs. New `agent-chho2 troubleshoot [capability]`
  read-only health check reports launcher presence, Docker daemon reachability,
  credentials/auth state, and pinned-vs-latest version drift. It does not connect,
  so it never triggers an interactive OAuth flow; a bump stays a deliberate action.
- **Interactive auth for remote capabilities** (milestone 2): new `agent-chho2 auth
  <capability>` command runs the one-time browser OAuth for remote servers (e.g.
  `atlassian`) and caches the token. Capability specs gained an `interactiveAuth`
  flag: such servers now surface stderr (so the authorization URL is visible on
  headless machines), and a task run pre-flights for a cached token, refusing to
  start with the exact `auth` command to run instead of hanging on a browser prompt.
- **Atlassian capability** (milestone 2): the `atlassian` role capability (used by
  QA to read Jira tickets and comment verdicts back) connects to Atlassian's remote
  MCP through the `mcp-remote` stdio bridge, targeting the Streamable HTTP endpoint
  (`/v1/mcp`); the HTTP+SSE endpoint is deprecated after 2026-06-30. OAuth runs in
  the browser on first connect and is cached, so later runs are non-interactive.
  Data-handling note: this routes Jira content (which may include personal data)
  to a third-party endpoint outside ap-south-1; the QA role comments back only
  after approval.
- **Gitea capability** (milestone 2): the `gitea` role capability now launches the
  official Gitea MCP server (`docker.gitea.com/gitea-mcp-server`) in stdio mode via
  Docker. `GITEA_ACCESS_TOKEN` and `GITEA_HOST` are read from the environment and
  forwarded to Docker by name; `GITEA_HOST` is required since Gitea has no universal
  SaaS endpoint. Verified live (53 tools). GitLab is planned (see TODO.md).
- **GitHub capability** (milestone 2): the `github` role capability now launches the
  official GitHub MCP server (`ghcr.io/github/github-mcp-server`) in stdio mode via
  Docker. The PAT (`GITHUB_PERSONAL_ACCESS_TOKEN`) is read from the environment and
  forwarded to Docker by name, so it never appears in argv or process listings.
  Capability specs gained a `requiresEnv` field: missing credentials now fail fast
  with a clear message (or skip the capability in a run) instead of an opaque crash.
- **Accurate token accounting** (milestone 2): token usage is now summed from the
  Agent SDK's cumulative `modelUsage` across all turns (was only the final turn),
  including cache read/write tokens, plus context-window utilization (`ctx %`). The
  run summary and JSONL audit now show in/out/cache/total, cost, and ctx%.
- **Orchestrator — first real end-to-end task** (milestone 2): `agent-chho2 run
  <role> <task> [key=value …]` (and the interactive shell) now connect a role's MCP
  capabilities, build the system prompt (persona + steps + outputStyle), drive Claude
  multi-turn via the claude-agent adapter, gate every tool call (hard-deny RCE-class
  and mutating built-ins; audit the rest), stream tool-call progress, and print a
  token/cost/memory/time summary. Verified live: QA `verify-ticket` drove Playwright
  against a real URL — navigate, snapshot, console, network — and returned a PASS
  verdict with evidence. Agent SDK MCP tools set `alwaysLoad`; `AskUserQuestion`
  disabled for headless runs.
- **MCP connectivity is live** (milestone 2): `McpManager` connects MCP servers over
  stdio via `@modelcontextprotocol/sdk`, listing and calling namespaced tools
  (`<server>.<tool>`). A capability registry maps role capabilities to server launch
  configs (Playwright first). New `agent-chho2 mcp <capability>` command connects a
  server and lists its tools — verified live against Playwright (23 tools).
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
