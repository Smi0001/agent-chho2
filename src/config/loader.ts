import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { ConfigSchema, type Config } from "./schema.js";

/** Expand a leading ~ to the user's home directory. */
export function expandHome(p: string): string {
  if (p === "~") return os.homedir();
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

async function readJsonIfExists(file: string): Promise<Record<string, unknown> | undefined> {
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw) as Record<string, unknown>;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw new Error(`Failed to read config ${file}: ${(err as Error).message}`);
  }
}

/** Repo-level .chho2.json overrides ~/.chho2/config.json. */
export async function loadConfig(cwd: string = process.cwd()): Promise<Config> {
  const globalFile = path.join(os.homedir(), ".chho2", "config.json");
  const repoFile = path.join(cwd, ".chho2.json");
  const globalCfg = (await readJsonIfExists(globalFile)) ?? {};
  const repoCfg = (await readJsonIfExists(repoFile)) ?? {};
  return ConfigSchema.parse({ ...globalCfg, ...repoCfg });
}

/**
 * Minimal .env loader (no dependency): KEY=VALUE per line, # comments, optional
 * surrounding quotes. Does NOT overwrite variables already set in the environment.
 * Secrets stay in the process env only — never logged or persisted by chho2.
 */
export async function loadDotEnv(cwd: string = process.cwd()): Promise<void> {
  let raw: string;
  try {
    raw = await fs.readFile(path.join(cwd, ".env"), "utf8");
  } catch {
    return;
  }
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}
