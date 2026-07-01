import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expandHome } from "./config/loader.js";

// Feature H: show unread CHANGELOG entries after an upgrade. The last-seen version is
// persisted in ~/.chho2/state.json; on a version change we print the CHANGELOG sections
// newer than that. Everything here is best-effort so it can never block startup.

const STATE_FILE = path.join(expandHome("~/.chho2"), "state.json");

function changelogPath(): string {
  // src/whatsnew.ts -> ../CHANGELOG.md ; dist/whatsnew.js -> ../CHANGELOG.md (in "files").
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.join(here, "..", "CHANGELOG.md");
}

function readLastSeen(): string | undefined {
  try {
    return (JSON.parse(readFileSync(STATE_FILE, "utf8")) as { lastSeenVersion?: string }).lastSeenVersion;
  } catch {
    return undefined;
  }
}

function writeLastSeen(version: string): void {
  try {
    mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    writeFileSync(STATE_FILE, `${JSON.stringify({ lastSeenVersion: version }, null, 2)}\n`);
  } catch {
    /* best-effort */
  }
}

/**
 * CHANGELOG sections (newest first, "## [version] …") from the top up to but excluding
 * the one matching `lastSeen`. Capped so a missing/old lastSeen never dumps the file.
 */
export function unreadSections(changelog: string, lastSeen: string | undefined): string {
  const sections = changelog.split(/^(?=## )/m).filter((s) => s.startsWith("## "));
  const out: string[] = [];
  for (const section of sections) {
    const ver = /^## \[([^\]]+)\]/.exec(section)?.[1];
    if (lastSeen && ver === lastSeen) break;
    out.push(section.trim());
    if (out.length >= 5) break;
  }
  return out.join("\n\n");
}

/**
 * Print unread CHANGELOG entries when the installed version differs from the last one
 * seen, then record the current version. First run only records (nothing to show).
 */
export function showWhatsNew(currentVersion: string): void {
  const lastSeen = readLastSeen();
  if (lastSeen === currentVersion) return;
  try {
    if (lastSeen !== undefined) {
      const unread = unreadSections(readFileSync(changelogPath(), "utf8"), lastSeen);
      if (unread) {
        console.log(`\n✨ What's new since v${lastSeen} (now v${currentVersion}):\n`);
        console.log(unread);
        console.log("");
      }
    }
  } catch {
    /* best-effort; never block startup */
  }
  writeLastSeen(currentVersion);
}
