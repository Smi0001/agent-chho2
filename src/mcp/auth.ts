import { existsSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import path from "node:path";
import type { CapabilitySpec } from "./registry.js";

// mcp-remote caches OAuth tokens under ~/.mcp-auth/, in a subdir it names from its
// OWN internal version constant, which lags the npm version (observed: the 0.1.37
// npm release writes to mcp-remote-0.1.36/, and 0.1.38 to mcp-remote-0.1.37/).
// Keying off our pinned npm version would therefore never match the dir mcp-remote
// actually writes, so version dirs are scanned rather than derived. Within a version
// dir, token files are named `<hash>_tokens.json` where the hash is mcp-remote's
// getServerUrlHash: md5 of the server URL (joined with authorize-resource/header
// parts we do not use). That gives an exact per-URL check per capability.
const AUTH_BASE = path.join(homedir(), ".mcp-auth");

/** The remote URL a capability's mcp-remote bridge targets (its first http(s) arg). */
export function specRemoteUrl(spec: CapabilitySpec): string | undefined {
  return spec.args?.find((a) => /^https?:\/\//.test(a));
}

/** mcp-remote's cache key for a server URL (getServerUrlHash with URL-only input). */
export function serverUrlHash(url: string): string {
  return createHash("md5").update(url).digest("hex");
}

/**
 * True if mcp-remote has a cached OAuth token for this capability's server URL.
 * Version-agnostic across cache dirs (see the note above), exact per URL. A spec
 * without a remote URL falls back to "any token present" rather than failing closed,
 * since the orchestrator only uses this as a pre-flight hint.
 */
export function interactiveAuthCached(spec: CapabilitySpec): boolean {
  return interactiveAuthCachedIn(AUTH_BASE, spec);
}

/** Testable core of interactiveAuthCached with an explicit cache root. */
export function interactiveAuthCachedIn(base: string, spec: CapabilitySpec): boolean {
  if (!existsSync(base)) return false;
  const url = specRemoteUrl(spec);
  if (!url) return hasTokenFile(base, 2);
  const wanted = `${serverUrlHash(url)}_tokens.json`;
  let entries: string[];
  try {
    entries = readdirSync(base);
  } catch {
    return false;
  }
  if (entries.includes(wanted)) return true;
  return entries.some((name) => {
    const dir = path.join(base, name);
    try {
      return statSync(dir).isDirectory() && existsSync(path.join(dir, wanted));
    } catch {
      return false;
    }
  });
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
