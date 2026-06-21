import { randomUUID } from "node:crypto";
import type { Config } from "./config/schema.js";
import type { Role, Task } from "./roles/types.js";
import { resolveCapabilities, missingRequiredEnv } from "./mcp/registry.js";
import { createProvider } from "./providers/registry.js";
import { AuditLogger, memSnapshot } from "./audit/logger.js";
import type { PermissionVerdict, RunStep } from "./providers/types.js";

// Tools that are never allowed, regardless of permission mode.
const HARD_DENY = [/run_code_unsafe/i];
// Built-in mutating tools — disabled; roles act through their MCP capabilities.
const MUTATING_BUILTINS = new Set(["Bash", "Write", "Edit", "MultiEdit", "NotebookEdit"]);

export interface RunTaskArgs {
  role: Role;
  task: Task;
  inputs: Record<string, string>;
  config: Config;
}

export async function runTask({ role, task, inputs, config }: RunTaskArgs): Promise<void> {
  const runId = `${isoNow().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
  const audit = new AuditLogger(config.audit.dir, runId);

  const { resolved, unknown } = resolveCapabilities(role.capabilities);
  if (unknown.length) {
    console.warn(`  (skipping unconfigured capabilities: ${unknown.join(", ")})`);
  }
  // Drop capabilities whose required credentials are absent, so the run proceeds
  // with the tools it can use rather than launching a server that cannot authenticate.
  const ready = resolved.filter((spec) => {
    const missing = missingRequiredEnv(spec);
    if (missing.length) {
      console.warn(`  (skipping ${spec.name}: missing ${missing.join(", ")} in env)`);
      return false;
    }
    return true;
  });

  const provider = await createProvider(config.provider);
  await provider.ensureReady();

  console.log(`\n▶ ${role.label} / ${task.label}`);
  console.log(
    `  provider: ${config.provider.id} (${config.provider.model})  ·  outputStyle: ${config.outputStyle}`,
  );
  console.log(
    `  MCP: ${ready.map((r) => r.name).join(", ") || "none"}  ·  permissions: ${config.permissions.mode}\n`,
  );

  const permission = async (
    toolName: string,
    input: Record<string, unknown>,
  ): Promise<PermissionVerdict> => {
    if (HARD_DENY.some((re) => re.test(toolName))) {
      await audit.log({
        ts: isoNow(), role: role.id, task: task.id, action: toolName,
        mode: config.permissions.mode, payload: input, result: "skipped",
        error: "hard-denied (dangerous/RCE-equivalent tool)",
      });
      console.log(`  ⛔ denied ${toolName} (disabled: RCE-equivalent)`);
      return { allow: false, message: "This tool is disabled by chho2 (RCE-equivalent)." };
    }
    if (MUTATING_BUILTINS.has(toolName)) {
      await audit.log({
        ts: isoNow(), role: role.id, task: task.id, action: toolName,
        mode: config.permissions.mode, payload: input, result: "skipped",
        error: "mutating built-in not allowed for this task",
      });
      console.log(`  ⛔ denied ${toolName} (use MCP tools; file/shell mutation disabled)`);
      return { allow: false, message: "Use the role's MCP tools; built-in mutation is disabled." };
    }
    // No outward connectors yet, so current tools are non-outward → allowed + audited.
    await audit.log({
      ts: isoNow(), role: role.id, task: task.id, action: toolName,
      mode: config.permissions.mode, payload: input, result: "ok",
    });
    return { allow: true };
  };

  let stepNo = 0;
  const onStep = (step: RunStep): void => {
    if (step.kind === "tool-call" && step.toolName) {
      stepNo += 1;
      console.log(`  ⚙ [${stepNo}] ${step.toolName}`);
    } else if (step.kind === "text" && step.text?.trim()) {
      console.log(`  · ${truncate(step.text.trim().split("\n")[0] ?? "", 120)}`);
    }
  };

  const startedMs = Date.now();
  try {
    const result = await provider.run({
      system: buildSystemPrompt(role, task, config.outputStyle),
      messages: [{ role: "user", content: buildGoal(task, inputs) }],
      mcpServers: ready.map((r) => ({ name: r.name, command: r.command, args: r.args })),
      maxTurns: 12,
      permission,
      onStep,
    });
    const ms = Date.now() - startedMs;
    const mem = memSnapshot();

    const u = result.usage;
    const cacheStr =
      u.cacheRead || u.cacheCreation ? ` (cache r${u.cacheRead ?? 0}/w${u.cacheCreation ?? 0})` : "";
    const ctxPct =
      result.contextWindow && result.contextUsed
        ? Math.round((result.contextUsed / result.contextWindow) * 100)
        : undefined;
    const ctxStr =
      ctxPct !== undefined ? ` · ctx ${ctxPct}% (${result.contextUsed}/${result.contextWindow})` : "";

    console.log("\n── result ──");
    console.log(result.text.trim() || "(no text returned)");
    console.log(
      `\n◷ tokens in ${u.input}, out ${u.output}, total ${u.total}${cacheStr}` +
        (result.costUsd !== undefined ? ` · $${result.costUsd.toFixed(4)}` : "") +
        ` · mem ${mem.rssMB}MB · ${ms} ms${ctxStr}` +
        (task.steps.length ? ` · ${stepNo} tool calls / ${task.steps.length} steps planned` : ""),
    );
    await audit.log({
      ts: isoNow(), role: role.id, task: task.id, action: "task.complete",
      tokens: result.usage, costEst: result.costUsd, ctxPct, result: "ok",
    });
    console.log(`audit: ${audit.path}`);
  } catch (err) {
    await audit.log({
      ts: isoNow(), role: role.id, task: task.id, action: "task.run",
      result: "error", error: (err as Error).message,
    });
    console.error(`\n✗ ${(err as Error).message}`);
    console.log(`audit: ${audit.path}`);
    process.exitCode = 1;
  }
}

function buildSystemPrompt(role: Role, task: Task, outputStyle: Config["outputStyle"]): string {
  const style =
    outputStyle === "terse"
      ? "Be extremely terse: sentence fragments, abbreviations, no filler. Preserve technical accuracy."
      : outputStyle === "concise"
        ? "Be concise: short, direct sentences; no preamble."
        : "";
  return [
    role.persona.trim(),
    task.steps.length
      ? "Follow these steps:\n" + task.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")
      : "",
    "Use ONLY the provided MCP tools to interact with the system. Do not use shell or file-mutation tools.",
    "When finished, report a clear, structured result (pass/fail or summary).",
    style,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildGoal(task: Task, inputs: Record<string, string>): string {
  const lines: string[] = [task.description || task.label];
  const entries = Object.entries(inputs);
  if (entries.length) {
    lines.push("\nInputs:");
    for (const [k, v] of entries) lines.push(`- ${k}: ${v}`);
  }
  const missing = task.inputs.filter((i) => !(i in inputs));
  if (missing.length) lines.push(`\n(Missing inputs: ${missing.join(", ")} — proceed with what you have.)`);
  return lines.join("\n");
}

function isoNow(): string {
  return new Date().toISOString();
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
