import { z } from "zod";

export const ProviderConfigSchema = z.object({
  id: z.enum(["claude-agent", "vercel"]).default("claude-agent"),
  vendor: z.enum(["anthropic", "openai", "google", "ollama"]).optional(),
  model: z.string().default("claude-opus-4-8"),
  baseURL: z.string().url().optional(),
});
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

export const PermissionsConfigSchema = z.object({
  mode: z.enum(["ask", "allowlist", "auto"]).default("ask"),
  promptTimeoutSeconds: z.number().int().positive().default(10),
  onTimeout: z.enum(["wait", "deny", "proceed"]).default("wait"),
});
export type PermissionsConfig = z.infer<typeof PermissionsConfigSchema>;

export const NotifyConfigSchema = z.object({
  /** Channels to notify on task completion/failure. Env-gated: a channel whose secret
   *  (CHHO2_SMTP_URL / CHHO2_SLACK_WEBHOOK_URL) is unset is skipped, so the effective
   *  channels are those you have configured. Set to [] to turn notifications off. */
  channels: z.array(z.enum(["email", "slack"])).default(["email", "slack"]),
  /** Email recipient (non-secret). Falls back to CHHO2_NOTIFY_EMAIL. */
  email: z.string().email().optional(),
});
export type NotifyConfig = z.infer<typeof NotifyConfigSchema>;

export const AuditConfigSchema = z.object({
  dir: z.string().default("~/.chho2/logs"),
  format: z.literal("jsonl").default("jsonl"),
});
export type AuditConfig = z.infer<typeof AuditConfigSchema>;

export const ConfigSchema = z.object({
  provider: ProviderConfigSchema.default({ id: "claude-agent", model: "claude-opus-4-8" }),
  outputStyle: z.enum(["normal", "concise", "terse"]).default("normal"),
  permissions: PermissionsConfigSchema.default({ mode: "ask", promptTimeoutSeconds: 10, onTimeout: "wait" }),
  notify: NotifyConfigSchema.default({ channels: ["email", "slack"] }),
  audit: AuditConfigSchema.default({ dir: "~/.chho2/logs", format: "jsonl" }),
  roleDirs: z.array(z.string()).default([]),
});
export type Config = z.infer<typeof ConfigSchema>;
