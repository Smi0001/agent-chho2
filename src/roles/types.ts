import { z } from "zod";

export const TaskSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string().optional(),
  /** Declared step plan; enables real progress + ETA (feature J). */
  steps: z.array(z.string()).default([]),
  /** Named inputs the shell will prompt for. */
  inputs: z.array(z.string()).default([]),
  /**
   * Optional subset of the role's capabilities this task actually needs. When set,
   * only these MCP servers are connected for the run (fewer servers to start, fewer
   * tools in context). Defaults to the role's full capability set when omitted.
   */
  capabilities: z.array(z.string()).optional(),
  /**
   * Optional allowlist of MCP tool names ("<server>.<tool>") this task should expose
   * to the model. When set, only these are offered (fewer tools = easier, more
   * reliable selection, especially for smaller models). Unset = all tools.
   */
  tools: z.array(z.string()).optional(),
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
