import type { Role } from "../roles/types.js";

export function renderRoles(roles: Role[]): string {
  if (roles.length === 0) return "No roles found.";
  const lines: string[] = ["Roles:"];
  for (const r of roles) {
    lines.push(`  ${r.id.padEnd(8)} ${r.label}${r.description ? " — " + r.description : ""}`);
    for (const t of r.tasks) {
      lines.push(`      • ${t.id.padEnd(18)} ${t.label}`);
    }
    if (r.capabilities.length) {
      lines.push(`      capabilities: ${r.capabilities.join(", ")}`);
    }
  }
  return lines.join("\n");
}

export function renderHelp(roles: Role[]): string {
  return [
    "agent-chho2 (छोटू) — interactive, role-based AI agent",
    "",
    "Usage:",
    "  agent-chho2                 Launch the interactive shell",
    "  agent-chho2 roles           List available roles and tasks",
    "  agent-chho2 doctor          Check config + credentials with a tiny live turn",
    "  agent-chho2 mcp <cap>       Connect an MCP capability and list its tools",
    "  agent-chho2 help, --help    Show this help",
    "  agent-chho2 version, -v     Show version",
    "",
    "Configuration:",
    "  Copy .chho2.example.json -> .chho2.json (repo) or ~/.chho2/config.json",
    "  Put credentials in .env (see .env.example). Never paste secrets in chat.",
    "",
    renderRoles(roles),
  ].join("\n");
}
