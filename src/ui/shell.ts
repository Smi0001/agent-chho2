import * as p from "@clack/prompts";
import type { Role } from "../roles/types.js";
import type { Config } from "../config/schema.js";

const HELP_VALUE = "__help__";

export async function runInteractive(roles: Role[], config: Config): Promise<void> {
  p.intro("छोटू — agent-chho2");

  if (roles.length === 0) {
    p.cancel("No roles found. Add *.role.yaml files or reinstall.");
    return;
  }

  const roleId = await p.select({
    message: "Choose a role:",
    options: [
      ...roles.map((r) => ({ value: r.id, label: r.label, hint: r.description })),
      { value: HELP_VALUE, label: "Help", hint: "list roles, tasks, and settings" },
    ],
  });
  if (p.isCancel(roleId)) {
    p.cancel("Cancelled.");
    return;
  }
  if (roleId === HELP_VALUE) {
    const { renderHelp } = await import("./help.js");
    p.note(renderHelp(roles), "Help");
    p.outro("Run `agent-chho2` again to start.");
    return;
  }

  const role = roles.find((r) => r.id === roleId);
  if (!role) {
    p.cancel("Role not found.");
    return;
  }

  if (role.tasks.length === 0) {
    p.cancel(`Role "${role.label}" has no tasks defined.`);
    return;
  }

  const taskId = await p.select({
    message: `Choose a ${role.label} task:`,
    options: role.tasks.map((t) => ({ value: t.id, label: t.label, hint: t.description })),
  });
  if (p.isCancel(taskId)) {
    p.cancel("Cancelled.");
    return;
  }

  const task = role.tasks.find((t) => t.id === taskId);
  if (!task) {
    p.cancel("Task not found.");
    return;
  }

  p.note(
    [
      `Role:         ${role.label}`,
      `Task:         ${task.label}`,
      `Provider:     ${config.provider.id} (${config.provider.model})`,
      `Output style: ${config.outputStyle}`,
      `Permissions:  ${config.permissions.mode}`,
      `MCP servers:  ${role.capabilities.join(", ") || "none"}`,
      task.steps.length ? `Steps:        ${task.steps.join("  →  ")}` : "Steps:        (open-ended)",
    ]
      .filter(Boolean)
      .join("\n"),
    "Selected",
  );

  const inputs: Record<string, string> = {};
  for (const key of task.inputs) {
    const val = await p.text({ message: `Input — ${key}:` });
    if (p.isCancel(val)) {
      p.cancel("Cancelled.");
      return;
    }
    if (val) inputs[key] = String(val);
  }

  const go = await p.confirm({ message: `Run ${role.label} / ${task.label} now?` });
  if (p.isCancel(go) || !go) {
    p.cancel("Cancelled.");
    return;
  }

  p.outro("Starting…");
  const { runTask } = await import("../orchestrator.js");
  await runTask({ role, task, inputs, config });
}
