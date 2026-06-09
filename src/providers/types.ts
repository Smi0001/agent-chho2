// The only provider-specific layer. Everything else (tools) comes from MCP,
// which is provider-neutral. Swap the brain by implementing ModelProvider.

export type ChatRole = "system" | "user" | "assistant" | "tool";

export interface Message {
  role: ChatRole;
  content: string;
}

/** A tool exposed to the model, sourced from a connected MCP server. */
export interface ToolDef {
  name: string;
  description?: string;
  inputSchema: unknown; // JSON Schema
}

export interface TokenUsage {
  input: number;
  output: number;
  total: number;
}

export interface RunStep {
  kind: "text" | "tool-call" | "tool-result";
  text?: string;
  toolName?: string;
}

/** An MCP server to launch for an agentic run (capability spec). */
export interface McpServerLaunch {
  name: string;
  command: string;
  args: string[];
}

export interface PermissionVerdict {
  allow: boolean;
  message?: string;
  updatedInput?: Record<string, unknown>;
}

/** Consulted before each tool call; the orchestrator applies policy + audit here. */
export type PermissionFn = (
  toolName: string,
  input: Record<string, unknown>,
) => Promise<PermissionVerdict>;

export interface RunOptions {
  system: string;
  messages: Message[];
  /** Manual tool list (vercel adapter / future). Unused by the agentic claude path. */
  tools?: ToolDef[];
  callTool?: (name: string, args: unknown) => Promise<unknown>;
  /** MCP servers to connect for an agentic, multi-turn run. */
  mcpServers?: McpServerLaunch[];
  maxTurns?: number;
  /** Permission gate for tool calls (deny-by-default for dangerous tools). */
  permission?: PermissionFn;
  onStep?: (step: RunStep) => void;
  signal?: AbortSignal;
}

export interface RunResult {
  text: string;
  usage: TokenUsage;
  /** Provider-reported cost in USD, when available. */
  costUsd?: number;
}

export interface ModelProvider {
  readonly id: string;
  /** Throw with a clear, actionable message if required credentials are missing. */
  ensureReady(): Promise<void>;
  run(opts: RunOptions): Promise<RunResult>;
}
