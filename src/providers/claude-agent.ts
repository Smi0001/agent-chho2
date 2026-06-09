import type { ModelProvider, Message, RunOptions, RunResult, RunStep } from "./types.js";

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

    const launches = opts.mcpServers ?? [];
    const hasMcp = launches.length > 0;
    const mcpServers = Object.fromEntries(
      launches.map((s) => [
        s.name,
        // alwaysLoad: keep the server's tools in the prompt instead of deferring
        // them behind ToolSearch (otherwise the agent wastes turns discovering them).
        {
          type: "stdio" as const,
          command: s.command,
          args: s.args,
          env: envStrings(),
          alwaysLoad: true,
        },
      ]),
    );

    const canUseTool = opts.permission
      ? async (toolName: string, input: Record<string, unknown>) => {
          const verdict = await opts.permission!(toolName, input);
          return verdict.allow
            ? ({ behavior: "allow", updatedInput: verdict.updatedInput ?? input } as const)
            : ({ behavior: "deny", message: verdict.message ?? "denied by policy" } as const);
        }
      : undefined;

    const q = query({
      prompt: toPrompt(opts.messages),
      options: {
        model: this.model,
        systemPrompt: opts.system,
        maxTurns: opts.maxTurns ?? (hasMcp ? 12 : 1),
        settingSources: [], // do not load the user's CLAUDE.md / settings
        permissionMode: "default",
        // Headless run: the agent must report blockers as text, not pause for input.
        disallowedTools: ["AskUserQuestion"],
        ...(hasMcp ? { mcpServers } : { tools: [] }),
        ...(canUseTool ? { canUseTool } : {}),
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
        for (const step of extractSteps(message)) opts.onStep?.(step);
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

/** Turn an assistant SDK message into progress steps (text + tool calls). */
function extractSteps(message: unknown): RunStep[] {
  const content = (message as { message?: { content?: unknown } }).message?.content;
  if (typeof content === "string") return content ? [{ kind: "text", text: content }] : [];
  if (!Array.isArray(content)) return [];
  const steps: RunStep[] = [];
  for (const raw of content) {
    const block = raw as { type?: string; text?: unknown; name?: unknown };
    if (block.type === "text" && typeof block.text === "string" && block.text.trim()) {
      steps.push({ kind: "text", text: block.text });
    } else if (block.type === "tool_use" && typeof block.name === "string") {
      steps.push({ kind: "tool-call", toolName: block.name });
    }
  }
  return steps;
}

/** process.env with undefined values dropped (SDK wants Record<string,string>). */
function envStrings(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) out[k] = v;
  return out;
}
