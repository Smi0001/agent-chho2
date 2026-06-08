import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config/loader.js";
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

// Support `tsx src/index.ts ...` direct execution (bin/cli.js calls main() itself).
const entry = process.argv[1];
const isDirect = entry ? fileURLToPath(import.meta.url) === path.resolve(entry) : false;
if (isDirect) {
  main(process.argv.slice(2)).catch((err: unknown) => {
    console.error(err instanceof Error ? err.stack : String(err));
    process.exit(1);
  });
}
