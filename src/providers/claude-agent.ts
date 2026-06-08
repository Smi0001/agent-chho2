import type { ModelProvider, RunOptions, RunResult } from "./types.js";

/**
 * Drives Claude via the Claude Agent SDK using a Claude Code subscription token
 * (CLAUDE_CODE_OAUTH_TOKEN from `claude setup-token`) — no separate API billing.
 * Falls back to ANTHROPIC_API_KEY if present.
 *
 * The token is read only from the environment, never from chat or config.
 * Milestone 2 wires @anthropic-ai/claude-agent-sdk here.
 */
export class ClaudeAgentProvider implements ModelProvider {
  readonly id = "claude-agent";

  constructor(private readonly model: string = "claude-opus-4-8") {}

  async ensureReady(): Promise<void> {
    if (!process.env.CLAUDE_CODE_OAUTH_TOKEN && !process.env.ANTHROPIC_API_KEY) {
      throw new Error(
        "claude-agent provider needs CLAUDE_CODE_OAUTH_TOKEN (run `claude setup-token`) " +
          "or ANTHROPIC_API_KEY in your environment/.env.",
      );
    }
  }

  async run(_opts: RunOptions): Promise<RunResult> {
    await this.ensureReady();
    throw new Error(
      `claude-agent.run() [model=${this.model}] is not wired yet (milestone 2). ` +
        "It will use @anthropic-ai/claude-agent-sdk with the subscription token and MCP tools.",
    );
  }
}
