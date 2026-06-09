// Maps a role "capability" name to an MCP server launch config. Start with
// Playwright (stdio); GitHub/GitLab/Gitea/Atlassian/Figma land in later steps
// (the remote/OAuth ones add a loopback auth flow on top of this).

export interface CapabilitySpec {
  name: string;
  command: string;
  args: string[];
  description?: string;
}

export const CAPABILITIES: Record<string, CapabilitySpec> = {
  playwright: {
    name: "playwright",
    command: "npx",
    args: ["-y", "@playwright/mcp@latest", "--headless"],
    description: "Browser automation: navigate, click, snapshot, console, network",
  },
};

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
