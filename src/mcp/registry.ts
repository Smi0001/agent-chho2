// Maps a role "capability" name to an MCP server launch config. Playwright,
// GitHub, and Gitea are stdio servers that authenticate with a token from the
// environment (no OAuth). GitLab is the same shape and is planned (see TODO.md).
// Atlassian/Figma land later; those remote/OAuth ones add a loopback auth flow.

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
}

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
};

/** Env vars a capability declares as required but that are absent/empty right now. */
export function missingRequiredEnv(spec: CapabilitySpec): string[] {
  return (spec.requiresEnv ?? []).filter((v) => !process.env[v]);
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
