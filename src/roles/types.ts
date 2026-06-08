import { z } from "zod";

export const TaskSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string().optional(),
  /** Declared step plan; enables real progress + ETA (feature J). */
  steps: z.array(z.string()).default([]),
  /** Named inputs the shell will prompt for. */
  inputs: z.array(z.string()).default([]),
});
export type Task = z.infer<typeof TaskSchema>;

export const RoleSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string().default(""),
  persona: z.string(),
  /** MCP server capabilities this role connects (e.g. playwright, github). */
  capabilities: z.array(z.string()).default([]),
  tasks: z.array(TaskSchema).default([]),
  guardrails: z
    .object({
      /** Outward write actions pre-approved under permissions.mode = allowlist. */
      allowWrites: z.array(z.string()).default([]),
    })
    .default({ allowWrites: [] }),
});
export type Role = z.infer<typeof RoleSchema>;
