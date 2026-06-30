# TODO

Pending work and recorded decisions for agent-chho2.

## Pending

### Per-URL auth detection for interactive (OAuth) capabilities

The auth check (`src/mcp/auth.ts`) is version-agnostic: it scans `~/.mcp-auth` for any
cached token. It is not keyed by the specific server URL, so any cached token counts.
Exact while only one mcp-remote server is configured (currently atlassian); becomes
loose with a second (e.g. figma). Tighten by computing mcp-remote's per-URL key the
way it does (`getServerUrlHash` of the server URL).

### Persist interactive write-approvals across runs

Approvals granted at the write-gate prompt are session-scoped (`sessionGrants` in the
orchestrator, in-memory). Persist approved `<server>.<tool>` entries (e.g. to a
user-level allowlist) so repeated runs do not re-prompt. Decide storage and scope
(per-role? per-repo?) and how it interacts with `permissions.mode`.

### Write classification via tool annotations

Classification uses explicit `WRITE_TOOLS` lists plus a name heuristic for uncurated
servers. MCP tool annotations (`readOnly`/`destructive`) would be more robust, but are
not available in the SDK's `canUseTool` callback (only name + input). Revisit if the
SDK surfaces annotations at decision time.

### Live-verify the write-approval prompt

The gate's decision logic is unit-tested, but the interactive clack confirm has not run
in a real TTY. Run a write task under `permissions.mode: ask` from a terminal to confirm
the prompt fires and approve/deny works end to end.

### Native HTTP transport for remote MCP servers (future)

Spiked 2026-06-28 and deferred. Configuring atlassian as `{type:"http", url:".../v1/mcp"}`
in a headless `query()` reports server status `needs-auth` and loads no tools: the SDK
needs its MCP OAuth control flow (`SDKControlMcpAuthenticate*`) wired, and
`settingSources: []` means it won't reuse Claude Code's auth. Only viable after wiring
headless OAuth; until then the mcp-remote stdio bridge stays the default.

## Resolved decisions (kept for context)

### Role guardrail name alignment — DONE

Write-guardrail enforcement is wired (`isOutwardWrite` + `decide()` in the orchestrator),
and the qa/dev role `allowWrites` were aligned to real `<server>.<tool>` names. Mapping
applied:

| Old placeholder            | Real tool                                   |
| -------------------------- | ------------------------------------------- |
| `github.createPullRequest` | `github.create_pull_request`                |
| `github.createComment`     | `github.add_issue_comment`                  |
| `gitea.createPullRequest`  | `gitea.pull_request_write` (create action)  |
| `gitlab.createMergeRequest`| `gitlab.create_merge_request` (provisional) |
| `atlassian.addComment`     | `atlassian.addCommentToJiraIssue`           |

### claude-agent run path: `alwaysLoad` removed

`alwaysLoad` blocks startup on connect, capped at the SDK's 5s connect timeout (per
sdk.d.ts); our servers (mcp-remote OAuth, Docker cold start, npx fetch) exceed it, so
their tools never loaded in the `run` path even though the standalone `mcp`/`auth`
commands worked. Tools now defer and surface via tool search after the background connect.

### mcp-remote auth cache is keyed by its own version constant

mcp-remote names its cache dir from an internal version constant (still `0.1.37` even in
the `0.1.38` npm release), not the npm version we pin. So a pin bump does not invalidate
the cache, and our auth detection is version-agnostic by design.
