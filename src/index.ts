import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, loadDotEnv } from "./config/loader.js";
import type { Config } from "./config/schema.js";
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

// Support `tsx src/index.ts ...` direct execution (bin/cli.js calls main() itself).
const entry = process.argv[1];
const isDirect = entry ? fileURLToPath(import.meta.url) === path.resolve(entry) : false;
if (isDirect) {
  main(process.argv.slice(2)).catch((err: unknown) => {
    console.error(err instanceof Error ? err.stack : String(err));
    process.exit(1);
  });
}
