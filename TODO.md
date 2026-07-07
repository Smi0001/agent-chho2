# TODO

Pending work and recorded decisions for agent-chho2.

## Pending

### figma-express — wired for non-commercial use (Commons Clause constraint)

`figma-express` (`figma-mcp-express`, Go plugin-bridge, compact batch-ops surface) is
wired as an alternative write backend, but only for **internal / non-commercial use**:
its `LICENSE` carries the **Commons Clause License Condition v1.0** (no-selling
restriction) even though the npm `license` field reports MIT. Constraint to honor: do
not enable `figma-express` in any copy of chho2 that is sold or offered as a paid
product; `figma-edit` (MIT) is the default and has no such restriction. If chho2 ever
heads toward commercial distribution, get legal sign-off or drop this capability.
Supply-chain note: it ships as ~149 MB of precompiled Go binaries (opaque vs CTF's
readable TypeScript). Write classification uses the name heuristic (its `create_*`/`set_*`
/`batch` tools gate correctly; `get_*`/`search_*`/`list_*` read).

### cursor-talk-to-figma-mcp — rejected (redundant/inferior to figma-edit)

Verified: MIT at source (`sonnylazuardi`), but the published npm package fails to start
(`ERR_PACKAGE_PATH_NOT_EXPORTED`) and registers 40 tools vs CTF's 92. CTF (`figma-edit`)
is the maintained, Claude-oriented fork of this same project, so cursor-talk adds nothing.
Not wired.

### Live-verify figma-edit end to end

The `figma-edit` capability (CTF) is verified at the layer chho2 owns: the MCP server
starts and enumerates 92 tools over stdio (also via `agent-chho2 mcp figma-edit`), write
classification / the `figma-edit.*` allowlist wildcard are unit-tested, and the CTF socket
server runs (on bun). BLOCKED on Linux: the workstation runs `figma-linux` (unofficial
snap), which cannot load local development plugins ("Unable to load code" / "error loading
the plugin environment"), so `join_channel` + real create/update cannot be exercised here.
This blocks CTF and FME plugin-bridges equally (client limitation, not our code). To
finish: run `agent-chho2 run designer create-design …` per `docs/figma-edit.md` on
official Figma Desktop (macOS/Windows), or via a Community-published bridge plugin, and
record whether create/update quality is good enough to keep.

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

### Implement promptTimeoutSeconds or drop it

`permissions.promptTimeoutSeconds` (default 10) is dead config: `confirmWrite` never
starts a timer, so a TTY prompt waits forever and the setting has no effect. The
`onTimeout: "deny"` value is also indistinguishable from `"wait"` (both deny in the
non-TTY branch, which only checks for `"proceed"`). Either wire a real timeout around
the clack confirm honoring `onTimeout`, or remove the two settings from the schema.

### Native HTTP transport for remote MCP servers (future)

Spiked 2026-06-28 and deferred. Configuring atlassian as `{type:"http", url:".../v1/mcp"}`
in a headless `query()` reports server status `needs-auth` and loads no tools: the SDK
needs its MCP OAuth control flow (`SDKControlMcpAuthenticate*`) wired, and
`settingSources: []` means it won't reuse Claude Code's auth. Only viable after wiring
headless OAuth; until then the mcp-remote stdio bridge stays the default.

## Resolved decisions (kept for context)

### Live-verify the write-approval prompt — DONE (2026-08-09)

Verified on the qa `update-comment` task against a live test Jira comment, all under
the default `permissions.mode: ask`:

- TTY approve: clack prompt rendered, approved, comment updated in place (content
  preserved, no duplicate).
- TTY deny: prompt rendered, denied, `⛔ denied write` printed, no write reached Jira,
  run ended gracefully with a FAIL report.
- Non-TTY: write denied outright (`onTimeout: "wait"`), audit `result: skipped`.
- Notifications (⏳ approval-needed, ✅ done, 🚨 error) all observed live in Slack.

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
