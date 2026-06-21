import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { ToolDef } from "../providers/types.js";
import { resolveCapabilities, missingRequiredEnv, type CapabilitySpec } from "./registry.js";

interface Connection {
  spec: CapabilitySpec;
  client: Client;
}

/**
 * Manages MCP client connections for a role's capabilities via stdio. Tools are
 * namespaced as "<server>.<tool>" (e.g. "playwright.browser_navigate").
 *
 * The vercel adapter and the orchestrator route tool calls here. The claude-agent
 * adapter hands MCP server specs to the Agent SDK directly (it owns its own loop),
 * so both paths share this registry but connect differently.
 */
export class McpManager {
  private connections: Connection[] = [];

  async connect(capabilities: string[]): Promise<{ connected: string[]; unknown: string[] }> {
    const { resolved, unknown } = resolveCapabilities(capabilities);
    for (const spec of resolved) {
      const missing = missingRequiredEnv(spec);
      if (missing.length) {
        throw new Error(
          `MCP capability "${spec.name}" needs ${missing.join(", ")} in the environment ` +
            `(set it in .env). Not found.`,
        );
      }
      const transport = new StdioClientTransport({
        command: spec.command,
        args: spec.args,
        env: process.env as Record<string, string>,
        stderr: "ignore",
      });
      const client = new Client({ name: "agent-chho2", version: "0.1.0" }, { capabilities: {} });
      await client.connect(transport);
      this.connections.push({ spec, client });
    }
    return { connected: resolved.map((s) => s.name), unknown };
  }

  get connected(): string[] {
    return this.connections.map((c) => c.spec.name);
  }

  async listTools(): Promise<ToolDef[]> {
    const out: ToolDef[] = [];
    for (const { spec, client } of this.connections) {
      const res = await client.listTools();
      for (const t of res.tools) {
        out.push({
          name: `${spec.name}.${t.name}`,
          description: t.description,
          inputSchema: t.inputSchema,
        });
      }
    }
    return out;
  }

  async callTool(qualifiedName: string, args: unknown): Promise<unknown> {
    const dot = qualifiedName.indexOf(".");
    const server = dot === -1 ? qualifiedName : qualifiedName.slice(0, dot);
    const tool = dot === -1 ? qualifiedName : qualifiedName.slice(dot + 1);
    const conn = this.connections.find((c) => c.spec.name === server);
    if (!conn) throw new Error(`No connected MCP server "${server}" for tool "${qualifiedName}".`);
    return conn.client.callTool({
      name: tool,
      arguments: (args ?? {}) as Record<string, unknown>,
    });
  }

  async close(): Promise<void> {
    await Promise.allSettled(this.connections.map((c) => c.client.close()));
    this.connections = [];
  }
}
