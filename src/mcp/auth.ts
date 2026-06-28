import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type { CapabilitySpec } from "./registry.js";

// mcp-remote caches OAuth tokens under ~/.mcp-auth/, in a subdir it names from its
// OWN internal version constant (observed: mcp-remote-0.1.37) — NOT the npm version
// we pin. Verified against the 0.1.38 release: its dist still hardcodes 0.1.37, so
// bumping the npm pin does not change the cache dir. We therefore detect tokens
// version-agnostically by scanning the tree; keying off our pinned npm version would
// never match the dir mcp-remote actually writes. Within a version dir, token files
// are named by a hash of the server URL (getServerUrlHash); per-URL keying is the
// refinement worth adding later (see TODO.md).
const AUTH_BASE = path.join(homedir(), ".mcp-auth");

/**
 * True if mcp-remote has any cached OAuth token on disk. Version-agnostic (see the
 * note above). The spec is accepted for a future per-URL check but is not used yet.
 */
export function interactiveAuthCached(_spec: CapabilitySpec): boolean {
  if (!existsSync(AUTH_BASE)) return false;
  return hasTokenFile(AUTH_BASE, 2);
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
 * none of the given specs need interactive auth.
 */
export function unauthedInteractiveCaps(specs: CapabilitySpec[]): string[] {
  return specs.filter((s) => s.interactiveAuth && !interactiveAuthCached(s)).map((s) => s.name);
}
