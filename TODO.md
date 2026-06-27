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

## Cross-capability: role guardrail names do not match server tool names

`guardrails.allowWrites` in the role YAMLs use camelCase placeholders that do not
match the real (snake_case) MCP tool names. Harmless today because the orchestrator
permission gate allows-and-audits all non-builtin tools and does not yet enforce
`allowWrites`. Must be aligned when write-guardrail enforcement is built.

| Role YAML guardrail        | Actual server tool                          |
| -------------------------- | ------------------------------------------- |
| `github.createPullRequest` | `github.create_pull_request`                |
| `github.createComment`     | `github.add_issue_comment`                  |
| `gitea.createPullRequest`  | `gitea.pull_request_write` (create action)  |
| `gitlab.createMergeRequest`| `gitlab.create_merge_request` (to verify)   |
| `atlassian.addComment`     | `atlassian.addCommentToJiraIssue`           |

(The QA role's `gitea.issue_write` guardrail already uses the real tool name, so it
needs no alignment.)
