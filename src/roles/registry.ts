import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { RoleSchema, type Role } from "./types.js";
import { expandHome } from "../config/loader.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const BUILTIN_DIR = path.join(here, "builtin");

async function loadRolesFromDir(dir: string): Promise<Role[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }
  const roles: Role[] = [];
  for (const name of entries) {
    if (!name.endsWith(".role.yaml") && !name.endsWith(".role.yml")) continue;
    const raw = await fs.readFile(path.join(dir, name), "utf8");
    const parsed = RoleSchema.safeParse(YAML.parse(raw));
    if (!parsed.success) {
      throw new Error(`Invalid role file ${name}: ${parsed.error.message}`);
    }
    roles.push(parsed.data);
  }
  return roles;
}

/**
 * Load built-in roles plus any user role directories. Earlier directories win on
 * id collisions, so built-ins take precedence over user overrides for now
 * (shadowing semantics can flip in a later milestone).
 */
export async function loadRoles(extraDirs: string[] = []): Promise<Role[]> {
  const dirs = [BUILTIN_DIR, ...extraDirs.map(expandHome)];
  const out: Role[] = [];
  const seen = new Set<string>();
  for (const dir of dirs) {
    for (const role of await loadRolesFromDir(dir)) {
      if (seen.has(role.id)) continue;
      seen.add(role.id);
      out.push(role);
    }
  }
  return out;
}
