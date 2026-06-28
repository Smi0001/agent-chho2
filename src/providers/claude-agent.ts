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
        // No alwaysLoad. It would force the tools into the turn-1 prompt, but as a
        // side effect blocks startup on connect capped at the SDK's 5s connect
        // timeout — and all our servers can exceed that on cold start (mcp-remote
        // OAuth, Docker image run, npx fetch), so past the cap the tools never load.
        // Letting them defer means the model discovers them via tool search once each
        // server connects in the background: a few extra turns, but the tools exist.
        {
          type: "stdio" as const,
          command: s.command,
          args: s.args,
          env: envStrings(),
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
    let contextWindow = 0;
    let peakContext = 0;

    for await (const message of q) {
      if (opts.signal?.aborted) {
        await q.interrupt?.();
        break;
      }
      if (message.type === "assistant") {
        for (const step of extractSteps(message)) opts.onStep?.(step);
        // Track the largest context the model processed (for context-window %).
        const tu = (message as { message?: { usage?: Record<string, number | undefined> } }).message
          ?.usage;
        if (tu) {
          const ctx =
            (tu.input_tokens ?? 0) +
            (tu.cache_read_input_tokens ?? 0) +
            (tu.cache_creation_input_tokens ?? 0);
          if (ctx > peakContext) peakContext = ctx;
        }
      } else if (message.type === "result") {
        // modelUsage is the authoritative CUMULATIVE per-model aggregate across all
        // turns; message.usage is only the final turn. Sum modelUsage (fallback to
        // message.usage if absent).
        const acc = sumModelUsage(message.modelUsage);
        if (acc.models > 0) {
          usage = {
            input: acc.input,
            output: acc.output,
            cacheRead: acc.cacheRead,
            cacheCreation: acc.cacheCreation,
            total: acc.input + acc.output + acc.cacheRead + acc.cacheCreation,
          };
          contextWindow = acc.contextWindow;
        } else {
          const u = message.usage as {
            input_tokens?: number;
            output_tokens?: number;
            cache_read_input_tokens?: number;
            cache_creation_input_tokens?: number;
          };
          const input = u?.input_tokens ?? 0;
          const output = u?.output_tokens ?? 0;
          const cacheRead = u?.cache_read_input_tokens ?? 0;
          const cacheCreation = u?.cache_creation_input_tokens ?? 0;
          usage = { input, output, cacheRead, cacheCreation, total: input + output + cacheRead + cacheCreation };
        }
        costUsd = message.total_cost_usd;
        if (message.subtype === "success") {
          text = message.result;
        } else {
          const errs = (message as { errors?: string[] }).errors?.join("; ") ?? message.subtype;
          throw new Error(`claude-agent run failed (${message.subtype}): ${errs}`);
        }
      }
    }

    return {
      text,
      usage,
      costUsd,
      contextWindow: contextWindow || undefined,
      contextUsed: peakContext || undefined,
    };
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

interface ModelUsageLike {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
  contextWindow?: number;
}

/** Sum the per-model cumulative usage map from a result message. */
function sumModelUsage(modelUsage: unknown): {
  models: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheCreation: number;
  contextWindow: number;
} {
  const models = Object.values((modelUsage as Record<string, ModelUsageLike>) ?? {});
  let input = 0;
  let output = 0;
  let cacheRead = 0;
  let cacheCreation = 0;
  let contextWindow = 0;
  for (const m of models) {
    input += m.inputTokens ?? 0;
    output += m.outputTokens ?? 0;
    cacheRead += m.cacheReadInputTokens ?? 0;
    cacheCreation += m.cacheCreationInputTokens ?? 0;
    if ((m.contextWindow ?? 0) > contextWindow) contextWindow = m.contextWindow ?? 0;
  }
  return { models: models.length, input, output, cacheRead, cacheCreation, contextWindow };
}

/** process.env with undefined values dropped (SDK wants Record<string,string>). */
function envStrings(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) out[k] = v;
  return out;
}
