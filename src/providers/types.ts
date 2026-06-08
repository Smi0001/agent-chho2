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

export interface RunOptions {
  system: string;
  messages: Message[];
  tools: ToolDef[];
  /** Invoke an MCP tool by name; supplied by the orchestrator. */
  callTool: (name: string, args: unknown) => Promise<unknown>;
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
