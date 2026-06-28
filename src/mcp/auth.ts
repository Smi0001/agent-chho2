import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type { CapabilitySpec } from "./registry.js";

// mcp-remote caches OAuth tokens here after a successful interactive login.
const AUTH_DIR = path.join(homedir(), ".mcp-auth");

/**
 * True if mcp-remote has any cached OAuth token on disk.
 *
 * Coarse on purpose: it confirms an interactive auth has completed at least once,
 * not that a token covers a specific server (mcp-remote keys its cache by a hash of
 * the server URL that we do not recompute here, to avoid coupling to its internals).
 * Good enough to catch the common "never authenticated" case before a headless run;
 * a per-server check is tracked in TODO.md.
 */
export function mcpRemoteAuthExists(): boolean {
  if (!existsSync(AUTH_DIR)) return false;
  return hasTokenFile(AUTH_DIR, 2);
}

function hasTokenFile(dir: string, depth: number): boolean {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return false;
  }
  if (entries.some((name) => /tokens?\.json$/i.test(name))) return true;
  if (depth <= 0) return false;
  for (const name of entries) {
    const full = path.join(dir, name);
    try {
      if (statSync(full).isDirectory() && hasTokenFile(full, depth - 1)) return true;
    } catch {
      // unreadable entry; skip
    }
  }
  return false;
}

/**
 * Names of interactive-auth capabilities that have no cached token yet. Empty when
 * none of the given specs need interactive auth, or when a token cache exists.
 */
export function unauthedInteractiveCaps(specs: CapabilitySpec[]): string[] {
  const needAuth = specs.filter((s) => s.interactiveAuth);
  if (needAuth.length === 0 || mcpRemoteAuthExists()) return [];
  return needAuth.map((s) => s.name);
}
