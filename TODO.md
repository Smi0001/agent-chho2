# TODO

Pending work and recorded decisions for agent-chho2.

## Pending

### figma-express ships in the free npm package (decision 2026-08-10)

v0.1.0 publishes from main with the Designer role and the `figma-express` registration
included. chho2 does not bundle or sell figma-express — the capability runs
`npx figma-mcp-express` on the end user's machine, and chho2 itself is free. The
standing constraint below is unchanged and now binds the published package: chho2 must
not be sold or offered as a paid product while `figma-express` is enabled. README and
`docs/figma-edit.md` carry the user-facing non-commercial notice.

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

### Write classification via tool annotations

Classification uses explicit `WRITE_TOOLS` lists plus a name heuristic for uncurated
servers. MCP tool annotations (`readOnly`/`destructive`) would be more robust, but are
not available in the SDK's `canUseTool` callback (only name + input). Revisit if the
SDK surfaces annotations at decision time.

### Native HTTP transport for remote MCP servers (future)

Spiked 2026-06-28 and deferred. Configuring atlassian as `{type:"http", url:".../v1/mcp"}`
in a headless `query()` reports server status `needs-auth` and loads no tools: the SDK
needs its MCP OAuth control flow (`SDKControlMcpAuthenticate*`) wired, and
`settingSources: []` means it won't reuse Claude Code's auth. Only viable after wiring
headless OAuth; until then the mcp-remote stdio bridge stays the default.

## Resolved decisions (kept for context)

### Backlog batch — DONE (2026-08-10)

Three pending items implemented together (see CHANGELOG "Unreleased"):

- **Per-URL auth detection**: `interactiveAuthCached` now matches the exact
  `<md5(serverUrl)>_tokens.json` file across all `~/.mcp-auth` version dirs (mcp-remote's
  internal cache-dir constant lags its npm version — the 0.1.37 release writes to
  `mcp-remote-0.1.36/` — so dir names are scanned, never derived). Specs without a
  remote URL keep the any-token fallback.
- **Persisted write-approvals**: scope decision = per role, user-level
  (`~/.chho2/approvals.json`). The prompt is a 3-way select (deny / this run / always
  for this role); "always" pre-approves in every permission mode and skips the prompt
  and notification. Revocation = edit or delete the file.
- **promptTimeoutSeconds enforced**: `onTimeout: "deny" | "proceed"` arm a timer that
  aborts the prompt (clack AbortSignal) and resolves accordingly; `"wait"` waits
  indefinitely. Non-TTY behavior unchanged except `"deny"` and `"wait"` are now
  documented equivalents there.

### Live-verify figma-edit end to end — DONE (2026-08-10)

Verified on official Figma Desktop (Windows) in a split topology: agent + MCP server +
socket server on Linux, plugin on Windows over an SSH-forwarded port 3055 (runbook in
`docs/figma-edit.md`). Both designer tasks passed against a Draft file under
`permissions.mode: allowlist` with the `figma-edit.*` wildcard:

- `create-design`: built a 390×844 login-screen wireframe (frame + 13 child nodes:
  logo placeholder, heading, subtitle, labelled email/password fields, primary button,
  forgot-password link) in ~102 s / 27 tool calls.
- `update-design`: read the frame first, then added a checkbox + label row, reusing the
  existing fill/stroke/margins/font instead of inventing styles.

Quality verdict: wireframe-grade output as documented — good enough to keep. Two bugs
found and fixed during verification: the runbook showed a `--permissions allowlist` CLI
flag that does not exist (allowlist mode comes from `.chho2.json`; docs corrected), and
`.chho2.json` was not gitignored.

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
