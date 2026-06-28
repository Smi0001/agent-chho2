import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, loadDotEnv } from "./config/loader.js";
import type { Config } from "./config/schema.js";
import type { Role } from "./roles/types.js";
import { loadRoles } from "./roles/registry.js";
import { renderHelp, renderRoles } from "./ui/help.js";

function version(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // src/index.ts -> ../package.json ; dist/index.js -> ../package.json
  try {
    const pkg = JSON.parse(readFileSync(path.join(here, "..", "package.json"), "utf8")) as {
      version?: string;
    };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

export async function main(argv: string[]): Promise<void> {
  const cmd = argv[0];

  if (cmd === "version" || cmd === "--version" || cmd === "-v") {
    console.log(version());
    return;
  }

  await loadDotEnv();
  const config = await loadConfig();
  const roles = await loadRoles(config.roleDirs);

  if (cmd === "help" || cmd === "--help" || cmd === "-h") {
    console.log(renderHelp(roles));
    return;
  }
  if (cmd === "roles") {
    console.log(renderRoles(roles));
    return;
  }
  if (cmd === "doctor") {
    await runDoctor(config);
    return;
  }
  if (cmd === "mcp") {
    await runMcp(argv.slice(1));
    return;
  }
  if (cmd === "auth") {
    await runAuth(argv.slice(1));
    return;
  }
  if (cmd === "troubleshoot") {
    await runTroubleshoot(argv.slice(1));
    return;
  }
  if (cmd === "run") {
    await runRun(argv.slice(1), roles, config);
    return;
  }
  if (cmd && cmd.startsWith("-")) {
    console.error(`Unknown option: ${cmd}\n`);
    console.log(renderHelp(roles));
    process.exitCode = 1;
    return;
  }

  // Default: interactive shell. Lazy import keeps `roles`/`--help`/`version` light.
  const { runInteractive } = await import("./ui/shell.js");
  await runInteractive(roles, config);
}

/** Health check: validate config + credentials, then run one tiny live turn. */
async function runDoctor(config: Config): Promise<void> {
  const { createProvider } = await import("./providers/registry.js");
  console.log("chho2 doctor");
  console.log(`  provider:    ${config.provider.id} (${config.provider.model})`);

  const provider = await createProvider(config.provider);
  try {
    await provider.ensureReady();
  } catch (err) {
    console.error(`  ✗ credentials: ${(err as Error).message}`);
    process.exitCode = 1;
    return;
  }
  console.log("  credentials: ok");
  console.log("  connectivity: running a tiny turn…");

  const startedMs = Date.now();
  try {
    const result = await provider.run({
      system: "You are a connectivity check. Answer in one short line.",
      messages: [{ role: "user", content: "Reply with exactly: OK" }],
      tools: [],
      callTool: async () => {
        throw new Error("no tools in doctor");
      },
    });
    const ms = Date.now() - startedMs;
    console.log(`  ✓ reply:     ${result.text.trim() || "(empty)"}`);
    console.log(
      `  tokens:      in ${result.usage.input}, out ${result.usage.output}, total ${result.usage.total}`,
    );
    if (result.costUsd !== undefined) console.log(`  cost:        $${result.costUsd.toFixed(4)}`);
    console.log(`  time:        ${ms} ms`);
  } catch (err) {
    console.error(`  ✗ connectivity: ${(err as Error).message}`);
    process.exitCode = 1;
  }
}

/** Run a role's task non-interactively: `run <role> <task> [key=value ...]`. */
async function runRun(args: string[], roles: Role[], config: Config): Promise<void> {
  const [roleId, taskId, ...rest] = args;
  if (!roleId || !taskId) {
    console.error("usage: agent-chho2 run <role> <task> [key=value ...]");
    process.exitCode = 1;
    return;
  }
  const role = roles.find((r) => r.id === roleId);
  if (!role) {
    console.error(`Unknown role: ${roleId}`);
    process.exitCode = 1;
    return;
  }
  const task = role.tasks.find((t) => t.id === taskId);
  if (!task) {
    console.error(`Unknown task "${taskId}" for role "${roleId}"`);
    process.exitCode = 1;
    return;
  }
  const inputs: Record<string, string> = {};
  for (const tok of rest) {
    const t = tok.startsWith("--") ? tok.slice(2) : tok;
    const eq = t.indexOf("=");
    if (eq > 0) inputs[t.slice(0, eq)] = t.slice(eq + 1);
  }
  const { runTask } = await import("./orchestrator.js");
  await runTask({ role, task, inputs, config });
}

/** Connect an MCP capability and list its tools (deterministic connectivity check). */
async function runMcp(args: string[]): Promise<void> {
  const cap = args[0];
  if (!cap) {
    console.error("usage: agent-chho2 mcp <capability>   (e.g. playwright)");
    process.exitCode = 1;
    return;
  }
  const { McpManager } = await import("./mcp/manager.js");
  const mgr = new McpManager();
  try {
    console.log(`Connecting MCP capability: ${cap} …`);
    const { connected, unknown } = await mgr.connect([cap]);
    if (unknown.length) {
      console.error(`Unknown capability: ${unknown.join(", ")}`);
      process.exitCode = 1;
      return;
    }
    const tools = await mgr.listTools();
    console.log(`Connected: ${connected.join(", ")}`);
    console.log(`Tools (${tools.length}):`);
    for (const t of tools) {
      const desc = t.description ? " — " + t.description.split("\n")[0] : "";
      console.log(`  ${t.name}${desc}`);
    }
  } finally {
    await mgr.close();
  }
}

/**
 * Interactively authenticate a remote (OAuth) capability once. Connecting drives
 * the mcp-remote browser flow (its stderr is surfaced, so the URL shows even when
 * the browser cannot auto-open); the token is then cached for non-interactive runs.
 */
async function runAuth(args: string[]): Promise<void> {
  const cap = args[0];
  if (!cap) {
    console.error("usage: agent-chho2 auth <capability>   (e.g. atlassian)");
    process.exitCode = 1;
    return;
  }
  const { CAPABILITIES } = await import("./mcp/registry.js");
  const spec = CAPABILITIES[cap];
  if (!spec) {
    console.error(`Unknown capability: ${cap}`);
    process.exitCode = 1;
    return;
  }
  if (!spec.interactiveAuth) {
    const via = spec.requiresEnv?.length ? ` via ${spec.requiresEnv.join(", ")} in .env` : "";
    console.log(`"${cap}" does not use interactive login; it authenticates from the environment${via}. Nothing to do.`);
    return;
  }
  const { McpManager } = await import("./mcp/manager.js");
  const mgr = new McpManager();
  console.log(`Authenticating "${cap}" …`);
  console.log("A browser will open to authorize. If it does not, copy the URL printed below.");
  console.log("The token is cached (~/.mcp-auth), so later runs are non-interactive.\n");
  try {
    await mgr.connect([cap]);
    const tools = await mgr.listTools();
    console.log(`\n✓ Authenticated "${cap}". ${tools.length} tools available; token cached.`);
  } catch (err) {
    console.error(`\n✗ auth failed: ${(err as Error).message}`);
    process.exitCode = 1;
  } finally {
    await mgr.close();
  }
}

/**
 * Read-only health check for one capability (or all): launcher present, docker
 * daemon up, credentials/auth in place, and mcp-remote version drift. Does not
 * connect, so it never triggers an interactive OAuth flow.
 */
async function runTroubleshoot(args: string[]): Promise<void> {
  const { CAPABILITIES } = await import("./mcp/registry.js");
  const { diagnose } = await import("./mcp/troubleshoot.js");
  const cap = args[0];
  if (cap && !CAPABILITIES[cap]) {
    console.error(`Unknown capability: ${cap}`);
    process.exitCode = 1;
    return;
  }
  const names = cap ? [cap] : Object.keys(CAPABILITIES);
  let anyFail = false;
  for (const name of names) {
    console.log(`\ntroubleshoot: ${name}`);
    for (const c of diagnose(CAPABILITIES[name]!)) {
      const mark = c.status === "ok" ? "✓" : c.status === "warn" ? "!" : "✗";
      if (c.status === "fail") anyFail = true;
      console.log(`  ${mark} ${c.label.padEnd(14)} ${c.detail}`);
    }
  }
  if (anyFail) process.exitCode = 1;
}

// Support `tsx src/index.ts ...` direct execution (bin/cli.js calls main() itself).
const entry = process.argv[1];
const isDirect = entry ? fileURLToPath(import.meta.url) === path.resolve(entry) : false;
if (isDirect) {
  main(process.argv.slice(2)).catch((err: unknown) => {
    console.error(err instanceof Error ? err.stack : String(err));
    process.exit(1);
  });
}
