import { promises as fs } from "node:fs";
import path from "node:path";
import { expandHome } from "../config/loader.js";

const SECRET_KEY = /(token|api[-_]?key|secret|password|authorization|cookie)/i;

/** Recursively redact secret-looking keys before anything is written to disk. */
export function redact(value: unknown): unknown {
  if (value == null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(redact);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SECRET_KEY.test(k) ? "[redacted]" : redact(v);
  }
  return out;
}

export function memSnapshot(): { rssMB: number; heapMB: number } {
  const m = process.memoryUsage();
  return { rssMB: Math.round(m.rss / 1048576), heapMB: Math.round(m.heapUsed / 1048576) };
}

export interface AuditEvent {
  ts: string;
  role?: string;
  task?: string;
  action: string;
  mode?: string;
  target?: string;
  payload?: unknown;
  tokens?: {
    input: number;
    output: number;
    cacheRead?: number;
    cacheCreation?: number;
    total: number;
  };
  costEst?: number;
  ctxPct?: number;
  result?: "ok" | "error" | "skipped";
  error?: string;
}

/** Append-only JSONL audit log; one file per run (feature G + I). */
export class AuditLogger {
  private readonly file: string;

  constructor(dir: string, runId: string) {
    this.file = path.join(expandHome(dir), `run-${runId}.jsonl`);
  }

  get path(): string {
    return this.file;
  }

  async log(event: AuditEvent): Promise<void> {
    const line = JSON.stringify({ ...event, payload: redact(event.payload), mem: memSnapshot() });
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    await fs.appendFile(this.file, line + "\n", "utf8");
  }
}
