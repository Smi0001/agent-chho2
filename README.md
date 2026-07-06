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

> ⚠️ **Data handling:** running a task sends the content it works on — repository code,
> Jira/Confluence text, PR diffs, logs — to third-party **MCP endpoints** (GitHub, GitLab,
> Atlassian, and others) and to the **model provider** you pick (Anthropic, OpenAI, Google,
> or a local model). Those are external services that may store or process the data outside
> your region. Do not run tasks on personal or regulated data without confirming it is
> allowed under your obligations (e.g. GDPR, India's DPDP Act). See
> [Safety & privacy](#safety--privacy).

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
  playwright · github/gitlab/gitea · atlassian · figma (read) · figma-edit (write)
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

### Local models (Ollama) and tool-calling

Text-only generation works with any Ollama model. Most roles, though, drive **MCP
tools**, and tool tasks need a model that emits **structured tool calls** (the
`tools` capability in Ollama). Check a model with `ollama show <model>` and look for
`tools` in its capabilities; a model without it will describe the call as text and
nothing runs.

Models tested against the `vercel` + Ollama path (a browser tool task):

| Model | Tool tasks | Notes |
| --- | --- | --- |
| `llama3.1:8b` | works | Recommended local default; fastest of those tested here. |
| `qwen2.5:14b` | works | Correct, but slow on a CPU-only box (about 7-8 min per run observed). |
| `qwen3:8b` | works, with a caveat | Supports tools, but its "thinking" mode is slow; append `/no_think` to the prompt to speed it up. |
| `qwen2.5-coder:7b` | no | Emits tool calls as plain text, so they never execute. |
| `deepseek-coder:6.7b` | no | No tool support; Ollama rejects the request. |

Speed is hardware-dependent (the figures above are from a CPU-only machine). On such
a machine the 8B class (`llama3.1:8b`) is the practical sweet spot for local tool
runs; larger and "thinking" models are correct but slower. Hosted vendors (Anthropic,
OpenAI, Google) do structured tool calls reliably if you want speed over local/free.

#### What works locally, by task

Tested with `llama3.1:8b`. Tasks that drive a **single, browser-style capability** run
well, including multi-step ones (it made 5 structured `playwright` calls to compare two
pages). Tasks that drive **Jira/Atlassian or Git-hosting** tools are **not** reliable
locally: with those larger toolsets the same model intermittently emits the call as
text instead of a structured tool call, even when the task is curated to one tool.

| Role · task | Capabilities | Local 8B (llama3.1:8b) | Recommended brain |
| --- | --- | --- | --- |
| dev · `compare-urls` | playwright | works | local ok |
| qa · `regression-sweep` | playwright | works (browser only) | local ok |
| dev · `fix-ui-bug` | playwright + github | browser repro yes; the GitHub/PR part is unreliable | frontier |
| dev · `open-pr` | github | unreliable | frontier |
| qa · `verify-ticket` | playwright + atlassian + github | unreliable (Jira flow) | `claude-agent` / hosted |
| qa · `update-comment` | atlassian | unreliable (Jira flow) | `claude-agent` / hosted |

Rule of thumb: browser-only tasks run on a tool-capable local 8B; anything touching
Jira/Atlassian or Git-hosting should use `claude-agent` or a hosted frontier model.
`ATLASSIAN_SITE` and per-task tool curation shorten the chains and help, but they do not
overcome a small model's unreliable structured tool-calling on the larger toolsets.

## Configuration

Copy [.chho2.example.json](.chho2.example.json) to `.chho2.json` (per-repo) or
`~/.chho2/config.json` (global). Highlights:

- `provider` — which brain to use.
- `outputStyle` — `normal | concise | terse` (terse = caveman-style token saving
  for narration; outward artifacts like PR/Jira text stay readable).
- `permissions.mode` — `ask` (default), `allowlist`, or `auto`. Outward writes (PRs,
  Jira comments, pushes) are gated: in `ask` mode they prompt for confirmation, in
  `allowlist` mode the tools on the role's `allowWrites` are pre-approved, and `auto`
  proceeds (all still audited). In a non-interactive run a gated write is denied
  unless `onTimeout` is set to `proceed`.
- `audit` — every action is appended to a **JSONL** log with tokens, cost, and
  memory usage.

## Safety & privacy

- **Third-party data flow (read this before regulated data).** Each capability sends the
  content it operates on to an external MCP server — GitHub, GitLab, Atlassian, Figma — and
  every model turn sends context to your chosen provider. These services may store or
  process the data outside your data-residency region. A local model (Ollama) keeps the
  model side on your machine, but the MCP connectors still reach their own services. Run
  tasks on personal, customer, or regulated data only when that egress is permitted under
  your obligations (e.g. GDPR, India's DPDP Act, sector rules).
- Secrets live only in the environment / gitignored `.env`; the audit log redacts them.
- Outward-facing writes (PRs, Jira comments, pushes) are gated by the permission
  policy and recorded in the audit log.
- OAuth connectors (e.g. Atlassian) authenticate via a local loopback browser flow
  handled by `mcp-remote`, which caches tokens on disk under `~/.mcp-auth` (not in the
  repo and not in the audit log). Treat that directory as sensitive.

## License

[Apache-2.0](LICENSE) © Shammi Hans. Part of the `@smi0001` agent family.
