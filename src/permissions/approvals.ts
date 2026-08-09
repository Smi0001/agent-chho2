import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

/**
 * Persisted write-approvals: outward writes the user approved at the prompt with
 * "always for this role". Stored user-level, keyed by role id, as a map of
 * roleId -> sorted list of "<server>.<tool>" actions. Scope is per role (not per
 * repo): an approval expresses trust in a role performing a class of outward write,
 * wherever chho2 runs. Revoke by editing or deleting the file.
 */
const DEFAULT_FILE = path.join(homedir(), ".chho2", "approvals.json");

export function loadApprovals(file: string = DEFAULT_FILE): Record<string, string[]> {
  try {
    const raw: unknown = JSON.parse(readFileSync(file, "utf8"));
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      const out: Record<string, string[]> = {};
      for (const [role, list] of Object.entries(raw)) {
        if (Array.isArray(list)) out[role] = list.filter((x): x is string => typeof x === "string");
      }
      return out;
    }
  } catch {
    // Missing or unparsable file counts as no approvals; the write path recreates it.
  }
  return {};
}

export function approvedForRole(roleId: string, file: string = DEFAULT_FILE): string[] {
  return loadApprovals(file)[roleId] ?? [];
}

export function persistApproval(roleId: string, action: string, file: string = DEFAULT_FILE): void {
  const all = loadApprovals(file);
  const list = new Set(all[roleId] ?? []);
  list.add(action);
  all[roleId] = [...list].sort();
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(all, null, 2) + "\n");
}
