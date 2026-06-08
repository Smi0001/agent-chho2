# @smi0001/agent-chho2 — छोटू

> _"Chhotu"_ (छोटू) — the eager little helper that does the legwork.

An **interactive, role-based AI agent** for software teams. You pick a **role**
(Dev, QA — Design and more later) and a **task**; छोटू drives the right **MCP
servers** (browser, Git hosting, Jira, Figma…) to actually do the work — run the
app, read logs and API responses, debug, open a PR, verify a ticket, comment back
to Jira — and reports what it did.

It is **provider-agnostic**: run it on Claude (your Claude Code subscription _or_
an Anthropic API key), OpenAI, Gemini, or a **local model** via Ollama.

> Status: **early scaffold (v0.1).** The architecture, role registry, and CLI
> surface are in place; connectors and adapters are being filled in. See
> [CHANGELOG.md](CHANGELOG.md).

---

## Why

Existing agents are single-purpose. छोटू is a **team of roles** behind one CLI:

- **Dev** — run the app, reproduce a UI bug from console/network logs, fix it,
  open a PR on GitHub/GitLab/Gitea.
- **QA** — reproduce a Jira ticket in a real browser, capture evidence, comment
  the result back to Jira.
- **…your role next** — roles are declarative YAML plugins. Adding *Design*
  (Figma MCP) means dropping in a `design.role.yaml`; no core changes.

## Architecture (at a glance)

```
Interactive shell  (pick role → pick task → confirm)
        │
Role registry      (dev.role.yaml, qa.role.yaml, … — persona + capabilities + tasks)
        │
Orchestrator       ── ModelProvider interface ──┐  swappable "brain"
        │                                        ├─ claude-agent  (Claude Agent SDK, subscription token)
Capabilities = MCP clients                       └─ vercel        (Vercel AI SDK: Anthropic/OpenAI/Gemini/Ollama)
  playwright · github/gitlab/gitea · atlassian · figma
        │
Cross-cutting: config · permissions · notifier · JSONL audit
```

The only provider-specific part is the **brain** (a `ModelProvider`); every
integration is an **MCP server**, which is provider-neutral.

## Install

```bash
npm install -g @smi0001/agent-chho2
# then:
agent-chho2
```

### Local development

```bash
npm install
npm run dev            # interactive shell via tsx (no build needed)
npm run dev roles      # list roles + tasks, non-interactive
npm run build          # compile to dist/ for publishing
```

## Authentication (pick one)

छोटू never reads secrets from the chat — only from your environment / `.env`
(which is gitignored). Copy [.env.example](.env.example) to `.env`.

| You have… | Provider | Env var | Billing |
| --- | --- | --- | --- |
| A Claude Code subscription (Pro/Max/Team) | `claude-agent` | `CLAUDE_CODE_OAUTH_TOKEN` (run `claude setup-token`) | Subscription (separate Agent-SDK quota) |
| An Anthropic API key | `vercel` | `ANTHROPIC_API_KEY` | Metered API |
| OpenAI / Gemini | `vercel` | `OPENAI_API_KEY` / `GOOGLE_GENERATIVE_AI_API_KEY` | Metered API |
| A local model | `vercel` (Ollama) | none — set `baseURL` in config | Free |

## Configuration

Copy [.chho2.example.json](.chho2.example.json) to `.chho2.json` (per-repo) or
`~/.chho2/config.json` (global). Highlights:

- `provider` — which brain to use.
- `outputStyle` — `normal | concise | terse` (terse = caveman-style token saving
  for narration; outward artifacts like PR/Jira text stay readable).
- `permissions.mode` — `ask` (default), `allowlist`, or `auto`. Outward/irreversible
  actions confirm by default; `auto` requires explicit opt-in. After
  `promptTimeoutSeconds` of no response, an email escalation fires (configurable).
- `audit` — every action is appended to a **JSONL** log with tokens, cost, and
  memory usage.

## Safety & privacy

- Secrets live only in the environment / gitignored `.env`; the audit log redacts them.
- Outward-facing writes (PRs, Jira comments, pushes) are gated by the permission
  policy and recorded in the audit log.
- OAuth connectors (Atlassian, Figma, …) use a local loopback browser flow; tokens
  are cached in the OS keychain, never in plaintext or logs.

## License

[Apache-2.0](LICENSE) © Shammi Hans. Part of the `@smi0001` agent family.
