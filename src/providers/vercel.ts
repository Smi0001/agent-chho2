import { generateText, tool, jsonSchema, stepCountIs, type LanguageModel, type ModelMessage } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { McpManager } from "../mcp/manager.js";
import type { ModelProvider, RunOptions, RunResult } from "./types.js";

export type VercelVendor = "anthropic" | "openai" | "google" | "ollama";

/**
 * Provider-agnostic adapter built on the Vercel AI SDK (v6). Supports hosted vendors
 * (Anthropic, OpenAI, Google) and local models via Ollama's OpenAI-compatible
 * endpoint. MCP tools come from our own McpManager (not the SDK's MCP client) so that
 * every tool call still passes through the orchestrator's permission gate and audit.
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

  private resolveModel(): LanguageModel {
    switch (this.vendor) {
      case "anthropic":
        return createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })(this.model);
      case "google":
        return createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY })(this.model);
      case "openai":
        // Use the chat-completions endpoint (.chat) rather than the v6 default
        // Responses API, so OpenAI-compatible proxies and tool calling work uniformly.
        return createOpenAI({ apiKey: process.env.OPENAI_API_KEY, baseURL: this.baseURL }).chat(this.model);
      case "ollama":
        // Ollama exposes an OpenAI-compatible /chat/completions API; no real key needed.
        return createOpenAI({
          apiKey: "ollama",
          baseURL: this.baseURL ?? "http://localhost:11434/v1",
        }).chat(this.model);
    }
  }

  async run(opts: RunOptions): Promise<RunResult> {
    await this.ensureReady();
    const model = this.resolveModel();
    const mgr = new McpManager();
    let text = "";
    let usage: RunResult["usage"] = { input: 0, output: 0, total: 0 };

    try {
      const launches = opts.mcpServers ?? [];
      if (launches.length) await mgr.connect(launches.map((s) => s.name));
      let defs = launches.length ? await mgr.listTools() : [];
      // Tool curation: McpManager names tools "<server>.<tool>", matching allowedTools.
      if (opts.allowedTools) defs = defs.filter((d) => opts.allowedTools!.includes(d.name));

      // Build AI SDK tools from MCP tools. Name them "mcp__<server>__<tool>" so the
      // permission gate's canonicalToolName/isOutwardWrite treat them identically to
      // the claude-agent path; call McpManager with the original "<server>.<tool>".
      const tools = Object.fromEntries(
        defs.map((d) => {
          const aiName = `mcp__${d.name.replace(".", "__")}`;
          return [
            aiName,
            tool({
              description: d.description,
              inputSchema: jsonSchema<Record<string, unknown>>(
                d.inputSchema as Parameters<typeof jsonSchema>[0],
              ),
              execute: async (args: Record<string, unknown>) => {
                const verdict = opts.permission
                  ? await opts.permission(aiName, args)
                  : { allow: true as const };
                if (!verdict.allow) {
                  return `Denied by policy: ${("message" in verdict && verdict.message) || "not approved"}`;
                }
                opts.onStep?.({ kind: "tool-call", toolName: d.name });
                const res = await mgr.callTool(
                  d.name,
                  ("updatedInput" in verdict && verdict.updatedInput) || args,
                );
                opts.onStep?.({ kind: "tool-result", toolName: d.name });
                return mcpResultToText(res);
              },
            }),
          ];
        }),
      );

      const result = await generateText({
        model,
        system: opts.system,
        messages: opts.messages.map((m) => ({ role: m.role, content: m.content })) as ModelMessage[],
        tools,
        stopWhen: stepCountIs(opts.maxTurns ?? 12),
        abortSignal: opts.signal,
        onStepFinish: ({ text: stepText }) => {
          if (stepText?.trim()) opts.onStep?.({ kind: "text", text: stepText });
        },
      });

      text = result.text;
      const u = result.usage;
      const input = u.inputTokens ?? 0;
      const output = u.outputTokens ?? 0;
      usage = {
        input,
        output,
        cacheRead: u.cachedInputTokens,
        total: u.totalTokens ?? input + output,
      };
    } finally {
      await mgr.close();
    }

    return { text, usage };
  }
}

/** Flatten an MCP CallToolResult into text the model can read. */
function mcpResultToText(res: unknown): string {
  const content = (res as { content?: Array<{ type?: string; text?: string }> })?.content;
  if (Array.isArray(content)) {
    return content.map((c) => (c?.type === "text" ? (c.text ?? "") : JSON.stringify(c))).join("\n");
  }
  return typeof res === "string" ? res : JSON.stringify(res);
}
