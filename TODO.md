# TODO

Tracked work that is planned but not yet in the codebase.

## GitLab capability (dev role)

Wired and verified during research, then pulled back out to ship Gitea first.
Re-add when we do the GitLab integration pass.

What was already verified:
- Server: `iwakitakuma/gitlab-mcp` (community, Docker stdio). Image manifest
  resolves on Docker Hub. Not yet run live against a real instance (no token set
  at the time).
- Env contract: `GITLAB_PERSONAL_ACCESS_TOKEN` (required); `GITLAB_API_URL`
  (optional, defaults to `https://gitlab.com/api/v4`, set for self-hosted).
- Tokens and base URL forward to Docker by name (`-e VAR`, no value), same pattern
  as the GitHub and Gitea capabilities.

Registry spec to re-add in `src/mcp/registry.ts` (`CAPABILITIES`):

```ts
gitlab: {
  name: "gitlab",
  command: "docker",
  args: [
    "run", "-i", "--rm",
    "-e", "GITLAB_PERSONAL_ACCESS_TOKEN",
    "-e", "GITLAB_API_URL",
    "iwakitakuma/gitlab-mcp",
  ],
  requiresEnv: ["GITLAB_PERSONAL_ACCESS_TOKEN"],
  description: "GitLab: projects, issues, merge requests, repo files (community server via Docker)",
},
```

`.env.example` block to re-add:

```
# --- GitLab capability (dev role) ---
GITLAB_PERSONAL_ACCESS_TOKEN=
# Optional. Defaults to https://gitlab.com/api/v4 (SaaS). Set for self-hosted.
GITLAB_API_URL=
```

Open decisions for the integration pass:
- Confirm the community server is the one to standardize on, or pick an
  alternative. The reference `@modelcontextprotocol/server-gitlab` is archived;
  GitLab's own MCP is a remote/OAuth offering, not a stdio server.
- Live-verify with a real token, then record the actual tool names.

## Cross-capability: role guardrail name alignment — DONE

Write-guardrail enforcement is wired (`isOutwardWrite` + `decide()` in the
orchestrator), and the qa/dev role `allowWrites` were aligned to real
"<server>.<tool>" names. The table below records the mapping applied.
`gitlab.create_merge_request` is provisional until the gitlab capability is re-added
and verified live. Follow-ups: persist interactive write-approvals across runs (they
are session-scoped today), and consider tool-annotation-based write classification.

| Role YAML guardrail        | Actual server tool                          |
| -------------------------- | ------------------------------------------- |
| `github.createPullRequest` | `github.create_pull_request`                |
| `github.createComment`     | `github.add_issue_comment`                  |
| `gitea.createPullRequest`  | `gitea.pull_request_write` (create action)  |
| `gitlab.createMergeRequest`| `gitlab.create_merge_request` (to verify)   |
| `atlassian.addComment`     | `atlassian.addCommentToJiraIssue`           |

(The QA role's `gitea.issue_write` guardrail already uses the real tool name, so it
needs no alignment.)

## Per-URL auth detection for interactive (OAuth) capabilities

The auth check (`src/mcp/auth.ts`) is version-agnostic: it scans `~/.mcp-auth` for
any cached token. (We tried keying it to the pinned npm version, but mcp-remote
names its cache dir from its own internal version constant — still `0.1.37` in the
`0.1.38` release — so npm-version keying never matched the real dir and gave false
negatives.) It is not keyed by the specific server URL: any cached token counts.
Exact while only one mcp-remote server is configured (currently atlassian); becomes
loose with a second (e.g. figma). Tighten by computing mcp-remote's per-URL key the
way it does (`getServerUrlHash` of the server URL).

## claude-agent run path: MCP tool loading

Fixed: removed `alwaysLoad` from the claude-agent provider's mcpServers config
(`src/providers/claude-agent.ts`). `alwaysLoad` blocks startup on connect, capped at
the SDK's 5s connect timeout (per sdk.d.ts); our servers (mcp-remote OAuth, Docker
cold start, npx fetch) exceed it, so their tools never loaded in the `run` path even
though the standalone `mcp`/`auth` commands worked. Tools now defer and surface via
tool search after the background connect.

Native HTTP transport — SPIKED 2026-06-28, DEFERRED. Configuring atlassian as
`{type:"http", url:".../v1/mcp"}` in a headless `query()` reports server status
`needs-auth` and loads no tools: the SDK needs its MCP OAuth control flow
(SDKControlMcpAuthenticate*) wired, and `settingSources: []` means it won't reuse
Claude Code's auth. Decision: keep the mcp-remote stdio bridge as the default; native
HTTP is only viable after wiring headless OAuth, so it stays a future/fallback option.
