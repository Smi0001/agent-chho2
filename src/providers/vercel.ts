import type { ModelProvider, RunOptions, RunResult } from "./types.js";

export type VercelVendor = "anthropic" | "openai" | "google" | "ollama";

/**
 * Provider-agnostic adapter built on the Vercel AI SDK. Supports hosted vendors
 * (Anthropic, OpenAI, Google) and local models via Ollama's OpenAI-compatible
 * endpoint. MCP tools are passed through unchanged.
 *
 * Milestone 2 wires `ai` + `@ai-sdk/*` and `experimental_createMCPClient`.
 */
export class VercelProvider implements ModelProvider {
  readonly id = "vercel";

  constructor(
    private readonly vendor: VercelVendor = "anthropic",
    private readonly model: string = "claude-opus-4-8",
    private readonly baseURL?: string,
  ) {}

  async ensureReady(): Promise<void> {
    const required: Record<VercelVendor, string | null> = {
      anthropic: "ANTHROPIC_API_KEY",
      openai: "OPENAI_API_KEY",
      google: "GOOGLE_GENERATIVE_AI_API_KEY",
      ollama: null, // local; no key
    };
    const key = required[this.vendor];
    if (key && !process.env[key]) {
      throw new Error(`vercel/${this.vendor} provider needs ${key} in your environment/.env.`);
    }
  }

  async run(_opts: RunOptions): Promise<RunResult> {
    await this.ensureReady();
    const where = this.baseURL ? ` @ ${this.baseURL}` : "";
    throw new Error(
      `vercel.run() [${this.vendor}/${this.model}${where}] is not wired yet (milestone 2). ` +
        "It will use the Vercel AI SDK with MCP tools.",
    );
  }
}
