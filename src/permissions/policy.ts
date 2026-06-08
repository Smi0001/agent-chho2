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
 * Decide whether an action may proceed without prompting (feature C).
 *  - reads (outward = false) are always allowed.
 *  - ask:       prompt for every outward action.
 *  - allowlist: outward actions on the role's allowlist are pre-approved.
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
      return roleAllowlist.includes(req.action) ? "allow" : "ask";
    case "ask":
    default:
      return "ask";
  }
}

/** Scopes granted up front when the user opts into allow-all for a session (feature C). */
export function sessionScopes(roleAllowlist: string[]): string[] {
  return [...new Set(roleAllowlist)];
}
