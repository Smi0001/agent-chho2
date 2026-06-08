import type { ToolDef } from "../providers/types.js";

export interface McpServerSpec {
  name: string;
  // stdio command / remote URL + OAuth details land in milestone 2
}

/**
 * Manages MCP client connections for a role's capabilities. The orchestrator asks
 * for the merged tool list and routes tool calls here.
 *
 * Milestone 2 wires @modelcontextprotocol/sdk: stdio servers for local tools and
 * the OAuth loopback flow (system browser + localhost callback, tokens cached in
 * the OS keychain) for remote servers like Atlassian and Figma.
 */
export class McpManager {
  private specs: McpServerSpec[] = [];

  async connect(capabilities: string[]): Promise<void> {
    this.specs = capabilities.map((name) => ({ name }));
    // TODO(milestone 2): start/connect servers; run OAuth where required.
  }

  get connected(): string[] {
    return this.specs.map((s) => s.name);
  }

  async listTools(): Promise<ToolDef[]> {
    return []; // populated from connected servers
  }

  async callTool(name: string, _args: unknown): Promise<unknown> {
    throw new Error(`MCP tool "${name}" not available — connectors not wired yet (milestone 2).`);
  }

  async close(): Promise<void> {
    this.specs = [];
  }
}
