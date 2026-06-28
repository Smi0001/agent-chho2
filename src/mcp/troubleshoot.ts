import { spawnSync } from "node:child_process";
import { missingRequiredEnv, MCP_REMOTE_VERSION, type CapabilitySpec } from "./registry.js";
import { interactiveAuthCached } from "./auth.js";

export interface Check {
  label: string;
  status: "ok" | "warn" | "fail";
  detail: string;
}

/**
 * Read-only diagnosis of a capability: launcher present, daemon up (docker),
 * credentials/auth in place, and pinned-vs-latest version drift for mcp-remote.
 * Does not connect (so it never triggers an interactive OAuth browser) and makes
 * one network call only for the version check.
 */
export function diagnose(spec: CapabilitySpec): Check[] {
  const checks: Check[] = [];

  const launcherFound = onPath(spec.command);
  checks.push({
    label: "launcher",
    status: launcherFound ? "ok" : "fail",
    detail: launcherFound ? `${spec.command} found` : `${spec.command} not on PATH`,
  });

  if (spec.command === "docker" && launcherFound) {
    const up = dockerDaemonUp();
    checks.push({
      label: "docker daemon",
      status: up ? "ok" : "fail",
      detail: up ? "reachable" : "not reachable — start Docker",
    });
  }

  if (spec.interactiveAuth) {
    const authed = interactiveAuthCached(spec);
    checks.push({
      label: "auth",
      status: authed ? "ok" : "warn",
      detail: authed
        ? "cached token present"
        : `not authenticated — run: agent-chho2 auth ${spec.name}`,
    });
  } else if ((spec.requiresEnv ?? []).length) {
    const missing = missingRequiredEnv(spec);
    checks.push({
      label: "credentials",
      status: missing.length ? "fail" : "ok",
      detail: missing.length
        ? `missing ${missing.join(", ")} in env`
        : `${spec.requiresEnv!.join(", ")} set`,
    });
  }

  if (spec.args.some((a) => a.startsWith("mcp-remote@"))) {
    const latest = npmLatest("mcp-remote");
    if (!latest) {
      checks.push({
        label: "mcp-remote",
        status: "warn",
        detail: `pinned ${MCP_REMOTE_VERSION}; could not check latest (offline?)`,
      });
    } else if (latest === MCP_REMOTE_VERSION) {
      checks.push({ label: "mcp-remote", status: "ok", detail: `pinned ${MCP_REMOTE_VERSION} (latest)` });
    } else {
      checks.push({
        label: "mcp-remote",
        status: "warn",
        detail: `pinned ${MCP_REMOTE_VERSION}; latest ${latest} — bump deliberately if the pin stops connecting`,
      });
    }
  }

  return checks;
}

// spec.command is from our own registry (e.g. "npx", "docker"), not user input.
function onPath(cmd: string): boolean {
  return spawnSync(`command -v ${cmd}`, { shell: true, stdio: "ignore" }).status === 0;
}

function dockerDaemonUp(): boolean {
  return spawnSync("docker", ["info"], { stdio: "ignore", timeout: 5000 }).status === 0;
}

function npmLatest(pkg: string): string | null {
  const r = spawnSync("npm", ["view", pkg, "version"], { encoding: "utf8", timeout: 15000 });
  if (r.status !== 0) return null;
  return r.stdout.trim() || null;
}
