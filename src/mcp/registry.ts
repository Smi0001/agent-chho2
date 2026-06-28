// Maps a role "capability" name to an MCP server launch config. Playwright,
// GitHub, and Gitea are stdio servers that authenticate with a token from the
// environment (no OAuth). GitLab is the same shape and is planned (see TODO.md).
// Atlassian is a remote server reached through the `mcp-remote` stdio bridge,
// which owns the OAuth loopback and token cache; chho2 needs no OAuth code for it.
// Figma (remote) lands later on the same bridge pattern.

export interface CapabilitySpec {
  name: string;
  command: string;
  args: string[];
  description?: string;
  /**
   * Environment variables that must be present for this server to start. Checked
   * before launch so a missing credential fails with a clear message instead of an
   * opaque server crash. Secrets live only in the environment, never in this config.
   */
  requiresEnv?: string[];
  /**
   * This server authenticates with an interactive browser OAuth flow (via the
   * mcp-remote bridge) rather than an environment token. Its stderr is surfaced so
   * the authorization URL is visible on headless machines, and a run pre-flights
   * for a cached token (see `agent-chho2 auth <capability>`).
   */
  interactiveAuth?: boolean;
}

// Pinned exact (not floating) for reproducible runs and supply-chain control.
// Updates are deliberate: `agent-chho2 troubleshoot` reports when a newer version
// exists. (mcp-remote keys its auth cache by its own internal version constant, not
// this npm version, so a bump does not by itself force a re-auth.)
export const MCP_REMOTE_VERSION = "0.1.37";

export const CAPABILITIES: Record<string, CapabilitySpec> = {
  playwright: {
    name: "playwright",
    command: "npx",
    args: ["-y", "@playwright/mcp@latest", "--headless"],
    description: "Browser automation: navigate, click, snapshot, console, network",
  },
  github: {
    name: "github",
    command: "docker",
    // Official GitHub MCP server in stdio mode. The PAT is forwarded by NAME
    // (`-e VAR` with no `=value`), so the token never appears in argv or process
    // listings — Docker reads it from this process's environment at spawn time.
    args: ["run", "-i", "--rm", "-e", "GITHUB_PERSONAL_ACCESS_TOKEN", "ghcr.io/github/github-mcp-server"],
    requiresEnv: ["GITHUB_PERSONAL_ACCESS_TOKEN"],
    description: "GitHub: repos, issues, pull requests, code search (official server via Docker)",
  },
  gitea: {
    name: "gitea",
    command: "docker",
    // Official Gitea MCP server (stdio). Token + host forwarded by name. Gitea is
    // host-specific (no universal SaaS), so GITEA_HOST is required — set it to your
    // self-hosted instance or the SaaS host (https://gitea.com).
    args: [
      "run", "-i", "--rm",
      "-e", "GITEA_ACCESS_TOKEN",
      "-e", "GITEA_HOST",
      "docker.gitea.com/gitea-mcp-server",
    ],
    requiresEnv: ["GITEA_ACCESS_TOKEN", "GITEA_HOST"],
    description: "Gitea: repos, issues, pull requests (official server via Docker)",
  },
  atlassian: {
    name: "atlassian",
    command: "npx",
    // Atlassian's remote MCP reached via the mcp-remote stdio bridge. Targets the
    // Streamable HTTP endpoint (/v1/mcp); the HTTP+SSE endpoint (/v1/sse) is
    // deprecated after 2026-06-30. mcp-remote runs the OAuth loopback in a browser
    // on first connect and caches the token, so later runs are non-interactive.
    // No requiresEnv: auth is OAuth via the browser, not an environment token.
    args: ["-y", `mcp-remote@${MCP_REMOTE_VERSION}`, "https://mcp.atlassian.com/v1/mcp"],
    interactiveAuth: true,
    description: "Atlassian: Jira issues, Confluence pages, search (remote MCP via mcp-remote)",
  },
};

/** Env vars a capability declares as required but that are absent/empty right now. */
export function missingRequiredEnv(spec: CapabilitySpec): string[] {
  return (spec.requiresEnv ?? []).filter((v) => !process.env[v]);
}

// Tools that mutate an external system, per capability (verified against live tool
// lists). A capability present here is classified EXPLICITLY: a tool is an outward
// write iff its name is in the set; everything else from that server is a read.
// Playwright is present-but-empty: browser actions are the agent's reproduction
// tools, not outward connector writes, so none are gated. Capabilities NOT listed
// here fall back to the name heuristic in isOutwardWrite().
const WRITE_TOOLS: Record<string, Set<string>> = {
  playwright: new Set(),
  atlassian: new Set([
    "addCommentToJiraIssue", "addWorklogToJiraIssue", "createJiraIssue", "editJiraIssue",
    "transitionJiraIssue", "createIssueLink", "createConfluencePage", "updateConfluencePage",
    "createConfluenceFooterComment", "createConfluenceInlineComment",
  ]),
  github: new Set([
    "add_comment_to_pending_review", "add_issue_comment", "add_reply_to_pull_request_comment",
    "assign_copilot_to_issue", "create_branch", "create_or_update_file", "create_pull_request",
    "create_repository", "delete_file", "fork_repository", "issue_write", "merge_pull_request",
    "pull_request_review_write", "push_files", "request_copilot_review", "sub_issue_write",
    "update_pull_request", "update_pull_request_branch",
  ]),
  gitea: new Set([
    "actions_config_write", "actions_run_write", "create_branch", "create_or_update_file",
    "create_release", "create_repo", "create_tag", "delete_branch", "delete_file",
    "delete_release", "delete_tag", "fork_repo", "issue_write", "label_write", "milestone_write",
    "notification_write", "package_write", "pull_request_review_write", "pull_request_write",
    "sub_issue_write", "timetracking_write", "wiki_write",
  ]),
};

// Heuristic for capabilities without an explicit WRITE_TOOLS set: a tool is a read
// only if its name clearly reads; otherwise treat it as a write (safe default).
const READ_HINT = /(?:^|[._])(get|list|search|read|fetch|view|describe|lookup)|_read$|info$|resources$|status$/i;

// Split a tool name into { server, tool }. Handles both namings we see: the
// claude-agent SDK's "mcp__<server>__<tool>" and McpManager's "<server>.<tool>".
// Returns null for built-in (non-MCP) tools.
function parseToolName(qualifiedName: string): { server: string; tool: string } | null {
  if (qualifiedName.startsWith("mcp__")) {
    const rest = qualifiedName.slice(5);
    const sep = rest.indexOf("__");
    if (sep === -1) return null;
    return { server: rest.slice(0, sep), tool: rest.slice(sep + 2) };
  }
  const dot = qualifiedName.indexOf(".");
  if (dot === -1) return null;
  return { server: qualifiedName.slice(0, dot), tool: qualifiedName.slice(dot + 1) };
}

/**
 * Canonical "<server>.<tool>" name for matching against role allowWrites and for
 * audit clarity, regardless of the source naming. Built-in tools return unchanged.
 */
export function canonicalToolName(qualifiedName: string): string {
  const p = parseToolName(qualifiedName);
  return p ? `${p.server}.${p.tool}` : qualifiedName;
}

/**
 * Whether a tool call mutates an external system. Built-in (non-MCP) tools are never
 * outward — mutating built-ins are hard-denied separately. Explicit per-server
 * write-lists win; uncurated servers use the read heuristic, biased so anything not
 * clearly a read counts as a write.
 */
export function isOutwardWrite(qualifiedName: string): boolean {
  const p = parseToolName(qualifiedName);
  if (!p) return false;
  const known = WRITE_TOOLS[p.server];
  if (known) return known.has(p.tool);
  return !READ_HINT.test(p.tool);
}

export function resolveCapabilities(names: string[]): {
  resolved: CapabilitySpec[];
  unknown: string[];
} {
  const resolved: CapabilitySpec[] = [];
  const unknown: string[] = [];
  for (const n of names) {
    const spec = CAPABILITIES[n];
    if (spec) resolved.push(spec);
    else unknown.push(n);
  }
  return { resolved, unknown };
}
