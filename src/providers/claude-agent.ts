import type { ModelProvider, Message, RunOptions, RunResult } from "./types.js";

/**
 * Drives Claude via the Claude Agent SDK using a Claude Code subscription token
 * (CLAUDE_CODE_OAUTH_TOKEN from `claude setup-token`) — no separate API billing.
 * Falls back to ANTHROPIC_API_KEY if present (the SDK honors the standard auth
 * precedence). The token is read only from the environment, never from chat/config.
 *
 * Milestone 2 (this step): a single text turn with no tools. MCP tools will be
 * passed through `options.mcpServers` in the next step.
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

  async run(opts: RunOptions): Promise<RunResult> {
    await this.ensureReady();
    const { query } = await import("@anthropic-ai/claude-agent-sdk");

    const q = query({
      prompt: toPrompt(opts.messages),
      options: {
        model: this.model,
        systemPrompt: opts.system,
        maxTurns: 1,
        tools: [], // pure text turn — no Bash/file/MCP access yet
        settingSources: [], // do not load the user's CLAUDE.md / settings
      },
    });

    let text = "";
    let usage: RunResult["usage"] = { input: 0, output: 0, total: 0 };
    let costUsd: number | undefined;

    for await (const message of q) {
      if (opts.signal?.aborted) {
        await q.interrupt?.();
        break;
      }
      if (message.type === "assistant") {
        const chunk = extractText(message);
        if (chunk) opts.onStep?.({ kind: "text", text: chunk });
      } else if (message.type === "result") {
        const u = message.usage as { input_tokens?: number; output_tokens?: number };
        const input = u?.input_tokens ?? 0;
        const output = u?.output_tokens ?? 0;
        usage = { input, output, total: input + output };
        costUsd = message.total_cost_usd;
        if (message.subtype === "success") {
          text = message.result;
        } else {
          const errs = (message as { errors?: string[] }).errors?.join("; ") ?? message.subtype;
          throw new Error(`claude-agent run failed (${message.subtype}): ${errs}`);
        }
      }
    }

    return { text, usage, costUsd };
  }
}

/** Flatten the conversation into a single prompt string for a one-shot turn. */
function toPrompt(messages: Message[]): string {
  const turns = messages.filter((m) => m.role === "user" || m.role === "assistant");
  if (turns.length === 1 && turns[0]) return turns[0].content;
  return turns.map((m) => `${m.role}: ${m.content}`).join("\n\n");
}

/** Pull plain text out of an assistant SDK message defensively. */
function extractText(message: unknown): string {
  const content = (message as { message?: { content?: unknown } }).message?.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((b): b is { type: "text"; text: string } => {
      const block = b as { type?: string; text?: unknown };
      return block.type === "text" && typeof block.text === "string";
    })
    .map((b) => b.text)
    .join("");
}
