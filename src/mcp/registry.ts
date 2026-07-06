// Maps a role "capability" name to an MCP server launch config. Playwright,
// GitHub, Gitea, and GitLab are stdio servers that authenticate with a token from
// the environment (no OAuth). Atlassian is a remote server reached through the
// `mcp-remote` stdio bridge, which owns the OAuth loopback and token cache; chho2
// needs no OAuth code for it. Figma is remote too (read-only design specs), on the
// same mcp-remote bridge pattern. `figma-edit` is a LOCAL plugin-bridge (CTF) that
// can create/modify designs by driving the Figma Plugin API through a companion
// desktop plugin over a localhost WebSocket — see the figma-edit spec below.

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
  /**
   * Optional guidance appended to the system prompt when this capability is active.
   * Use it to remove avoidable tool-call chains (e.g. tell the model the Atlassian
   * cloudId so it skips the discovery call). Returns undefined when not configured.
   */
  promptHint?: () => string | undefined;
}

// Pinned exact (not floating) for reproducible runs and supply-chain control.
// Updates are deliberate: `agent-chho2 troubleshoot` reports when a newer version
// exists. (mcp-remote keys its auth cache by its own internal version constant, not
// this npm version, so a bump does not by itself force a re-auth.)
export const MCP_REMOTE_VERSION = "0.1.37";

// The local Figma plugin-bridge (CTF, MIT). Pinned exact for reproducible runs and
// supply-chain control, like MCP_REMOTE_VERSION. This server drives the Figma Plugin
// API (create/modify design nodes) through a companion desktop plugin; it is the only
// path to writing designs, since Figma's official/remote MCP is read-only.
export const FIGMA_EDIT_VERSION = "1.0.0";

// Alternative local Figma plugin-bridge (figma-mcp-express, Go). Compact batch-ops tool
// surface. LICENSE: Commons Clause layered on the base license (npm reports MIT) — it
// forbids SELLING the software, so it is wired for INTERNAL / NON-COMMERCIAL use only.
// Do not redistribute chho2 for sale with this capability enabled. See docs/figma-edit.md.
export const FIGMA_EXPRESS_VERSION = "2.7.0";

export const CAPABILITIES: Record<string, CapabilitySpec> = {
  playwright: {
    name: "playwright",
    command: "npx",
    args: ["-y", "@playwright/mcp@latest", "--headless"],
    description: "Browser automation: navigate, click, snapshot, console, network",
  },
  "chrome-devtools": {
    name: "chrome-devtools",
    command: "npx",
    // Google's chrome-devtools-mcp (stdio, no token). Headless for agent runs.
    args: ["-y", "chrome-devtools-mcp@latest", "--headless"],
    description: "Chrome DevTools: performance traces, network + console inspection, DOM",
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
  gitlab: {
    name: "gitlab",
    command: "docker",
    // Community GitLab MCP server (stdio). Token + optional API URL forwarded by
    // name; GITLAB_API_URL defaults to https://gitlab.com/api/v4 when unset, so SaaS
    // needs no config and a self-hosted instance just sets it in .env.
    args: [
      "run", "-i", "--rm",
      "-e", "GITLAB_PERSONAL_ACCESS_TOKEN",
      "-e", "GITLAB_API_URL",
      "iwakitakuma/gitlab-mcp",
    ],
    requiresEnv: ["GITLAB_PERSONAL_ACCESS_TOKEN"],
    description: "GitLab: projects, issues, merge requests, repo files (community server via Docker)",
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
    // If the site is configured, tell the model to use it as cloudId so it makes a
    // single call instead of the resolve-cloudId -> fetch chain (which trips up
    // smaller models). The tools accept the site hostname as cloudId.
    promptHint: () => {
      const site = process.env.ATLASSIAN_SITE;
      return site
        ? `Atlassian: pass cloudId="${site}" directly to Jira/Confluence tools (e.g. getJiraIssue, addCommentToJiraIssue). Do not call resource-discovery tools to resolve the cloudId.`
        : undefined;
    },
  },
  figma: {
    name: "figma",
    command: "npx",
    // Figma's remote MCP (read-only: design specs, variables, screenshots) reached via
    // the mcp-remote bridge, same OAuth-cached pattern as atlassian. Cannot create or
    // edit designs; that needs a Figma plugin-bridge server (see TODO.md).
    args: ["-y", `mcp-remote@${MCP_REMOTE_VERSION}`, "https://mcp.figma.com/mcp"],
    interactiveAuth: true,
    description: "Figma: read designs, frames, components, variables, dev-mode specs (remote MCP)",
  },
  "figma-edit": {
    name: "figma-edit",
    command: "npx",
    // CTF (claude-talk-to-figma-mcp, MIT). This is the MCP *server* bin; it connects
    // to a localhost WebSocket socket server (default :3055) that a companion Figma
    // desktop plugin also joins. Writing designs therefore needs three local pieces
    // running: this server (chho2 spawns it), the socket server, and the plugin in
    // Figma Desktop — see docs/figma-edit.md. No env token: pairing is by channel over
    // localhost, so nothing leaves the machine except the design ops Figma itself sends
    // to its cloud (the same file the designer already edits by hand).
    args: ["-y", "-p", `claude-talk-to-figma-mcp@${FIGMA_EDIT_VERSION}`, "claude-talk-to-figma-mcp-server"],
    description: "Figma (local plugin-bridge): create and modify designs — frames, text, shapes, styles, components",
    // Tell the model to pair with the plugin before anything else, and give it the two
    // ergonomic rules that otherwise cost failed calls (fonts, top-level frame).
    promptHint: () => {
      const ch = process.env.FIGMA_CHANNEL;
      const join = ch
        ? `call join_channel with channel="${ch}"`
        : `call join_channel with the channel id shown in the Figma plugin UI`;
      return (
        `Figma edit: FIRST ${join} to pair with the running Figma plugin; no other tool works until paired. ` +
        `Create nodes under a top-level frame, and call load_font_async before setting any text.`
      );
    },
  },
  "figma-express": {
    name: "figma-express",
    command: "npx",
    // figma-mcp-express (Go binary via npx wrapper). Alternative to figma-edit with a
    // compact batch-ops surface. Same plugin-bridge shape: needs its own Figma desktop
    // plugin + a channel over localhost (port below). LICENSE is Commons Clause
    // (non-commercial) — see FIGMA_EXPRESS_VERSION. Docs: docs/figma-edit.md.
    args: ["-y", `figma-mcp-express@${FIGMA_EXPRESS_VERSION}`, "--port", "1994"],
    description: "Figma (local plugin-bridge, alt): create/modify designs via compact batch ops — NON-COMMERCIAL license",
    promptHint: () => {
      const ch = process.env.FIGMA_CHANNEL;
      const join = ch ? ` (channel "${ch}")` : " (see list_channels)";
      return (
        `Figma express: pair with the running plugin${join} first. To build, discover ops with ` +
        `search_batch_ops(category) then get_batch_op_spec(op), and apply them with batch(ops:[...]).`
      );
    },
  },
};

/** Env vars a capability declares as required but that are absent/empty right now. */
export function missingRequiredEnv(spec: CapabilitySpec): string[] {
  return (spec.requiresEnv ?? []).filter((v) => !process.env[v]);
}

/**
 * Drop "-e VAR" forwarding pairs whose VAR is empty/unset, so an unset optional
 * variable (e.g. GITLAB_API_URL) is not forwarded to Docker as an empty value — some
 * servers reject an empty value and exit. Only bare "-e VAR" pairs are affected, never
 * "-e VAR=value". Required vars are guaranteed set by the missingRequiredEnv pre-check.
 */
export function prunedLaunchArgs(args: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    const next = args[i + 1];
    if (a === "-e" && next !== undefined && !next.includes("=") && !process.env[next]) {
      i++; // skip both "-e" and the unset variable name
      continue;
    }
    out.push(a);
  }
  return out;
}

// Tools that mutate an external system, per capability (verified against live tool
// lists). A capability present here is classified EXPLICITLY: a tool is an outward
// write iff its name is in the set; everything else from that server is a read.
// Playwright is present-but-empty: browser actions are the agent's reproduction
// tools, not outward connector writes, so none are gated. Capabilities NOT listed
// here fall back to the name heuristic in isOutwardWrite().
const WRITE_TOOLS: Record<string, Set<string>> = {
  playwright: new Set(),
  "chrome-devtools": new Set(), // browser investigation tools, not outward writes
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
  // Local Figma plugin-bridge (CTF). Every tool that mutates the design is listed;
  // reads (get_*, scan_text_nodes, get_svg, export_node_as_image, load_font_async) and
  // the join_channel pairing call fall outside the set and stay allowed. These are
  // gated because they change the designer's real Figma file (deletes included); the
  // designer role pre-approves them in allowlist mode via a `figma-edit.*` allowWrite.
  "figma-edit": new Set([
    // creation
    "create_rectangle", "create_frame", "create_text", "create_ellipse", "create_polygon",
    "create_star", "group_nodes", "ungroup_nodes", "clone_node", "insert_child", "flatten_node",
    "boolean_operation",
    // modification
    "set_fill_color", "set_stroke_color", "set_selection_colors", "move_node", "resize_node",
    "delete_node", "set_corner_radius", "set_auto_layout", "set_effects", "set_effect_style_id",
    "rotate_node", "set_node_properties", "reorder_node", "convert_to_frame", "set_gradient",
    "set_image", "set_grid", "set_guide", "set_annotation", "rename_node",
    // text
    "set_text_content", "set_multiple_text_contents", "set_font_name", "set_font_size",
    "set_font_weight", "set_letter_spacing", "set_line_height", "set_paragraph_spacing",
    "set_text_case", "set_text_decoration", "set_text_style_id", "set_text_align",
    // styles + components + variables
    "create_text_style", "create_paint_style", "create_effect_style",
    "create_component_instance", "create_component_from_node", "create_component_set",
    "set_instance_variant", "set_reactions", "detach_instance",
    "set_variable", "apply_variable_to_node", "switch_variable_mode",
    // images, svg, pages, figjam
    "set_image_fill", "replace_image_fill", "apply_image_transform", "set_image_filters", "set_svg",
    "create_page", "delete_page", "rename_page", "set_current_page", "duplicate_page",
    "create_sticky", "set_sticky_text", "create_shape_with_text", "create_connector", "create_section",
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
