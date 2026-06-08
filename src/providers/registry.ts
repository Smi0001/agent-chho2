import type { ModelProvider } from "./types.js";
import type { ProviderConfig } from "../config/schema.js";

/** Lazily construct the configured provider (keeps non-task commands light). */
export async function createProvider(cfg: ProviderConfig): Promise<ModelProvider> {
  switch (cfg.id) {
    case "claude-agent": {
      const { ClaudeAgentProvider } = await import("./claude-agent.js");
      return new ClaudeAgentProvider(cfg.model);
    }
    case "vercel": {
      const { VercelProvider } = await import("./vercel.js");
      return new VercelProvider(cfg.vendor ?? "anthropic", cfg.model, cfg.baseURL);
    }
    default: {
      const id = (cfg as { id: string }).id;
      throw new Error(`Unknown provider id: ${id}`);
    }
  }
}
