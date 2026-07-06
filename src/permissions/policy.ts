import type { PermissionsConfig } from "../config/schema.js";

export type Decision = "allow" | "ask" | "deny";

export interface ActionRequest {
  /** e.g. "github.createComment" */
  action: string;
  /** Does it write to an external system (PR, Jira comment, push)? */
  outward: boolean;
  summary: string;
}

/**
 * Whether an action is covered by an allowlist entry. Supports an exact
 * `<server>.<tool>` match and a per-server wildcard `<server>.*` that pre-approves
 * every write from that server. The wildcard is for local, bulk-write capabilities
 * (e.g. `figma-edit.*`, where a single create-design task calls dozens of distinct
 * write tools); it is not appropriate for outward connector writes (Jira/GitHub),
 * which stay enumerated one tool at a time.
 */
export function allowlistCovers(action: string, allowlist: string[]): boolean {
  if (allowlist.includes(action)) return true;
  const dot = action.indexOf(".");
  if (dot === -1) return false;
  return allowlist.includes(`${action.slice(0, dot)}.*`);
}

/**
 * Decide whether an action may proceed without prompting (feature C).
 *  - reads (outward = false) are always allowed.
 *  - ask:       prompt for every outward action.
 *  - allowlist: outward actions on the role's allowlist are pre-approved
 *               (exact `<server>.<tool>` or a `<server>.*` wildcard).
 *  - auto:      outward actions proceed (still audited).
 */
export function decide(
  cfg: PermissionsConfig,
  req: ActionRequest,
  roleAllowlist: string[],
): Decision {
  if (!req.outward) return "allow";
  switch (cfg.mode) {
    case "auto":
      return "allow";
    case "allowlist":
      return allowlistCovers(req.action, roleAllowlist) ? "allow" : "ask";
    case "ask":
    default:
      return "ask";
  }
}

/** Scopes granted up front when the user opts into allow-all for a session (feature C). */
export function sessionScopes(roleAllowlist: string[]): string[] {
  return [...new Set(roleAllowlist)];
}
