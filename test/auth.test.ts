import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { serverUrlHash, specRemoteUrl, interactiveAuthCachedIn } from "../src/mcp/auth.js";
import type { CapabilitySpec } from "../src/mcp/registry.js";

const URL_A = "https://mcp.example.com/v1/mcp";
const URL_B = "https://mcp.other.com/mcp";

function spec(url?: string): CapabilitySpec {
  return {
    name: "cap",
    command: "npx",
    args: url ? ["-y", "mcp-remote@0.1.37", url] : ["-y", "some-local-server"],
    description: "test capability",
    interactiveAuth: true,
  } as CapabilitySpec;
}

function tempAuthBase(): string {
  return mkdtempSync(path.join(tmpdir(), "chho2-auth-"));
}

test("serverUrlHash matches mcp-remote's md5 URL keying", () => {
  // Reference value: md5("https://mcp.atlassian.com/v1/mcp")
  assert.equal(serverUrlHash("https://mcp.atlassian.com/v1/mcp"), "01910c24c5f2edcaf999bd1eaaeaeee8");
});

test("specRemoteUrl extracts the http(s) arg, none for local servers", () => {
  assert.equal(specRemoteUrl(spec(URL_A)), URL_A);
  assert.equal(specRemoteUrl(spec()), undefined);
});

test("auth cached: exact per-URL token in a version dir is found", () => {
  const base = tempAuthBase();
  try {
    const dir = path.join(base, "mcp-remote-0.1.36");
    mkdirSync(dir);
    writeFileSync(path.join(dir, `${serverUrlHash(URL_A)}_tokens.json`), "{}");
    assert.equal(interactiveAuthCachedIn(base, spec(URL_A)), true);
    // A different URL's token must NOT count (the false positive this fixes).
    assert.equal(interactiveAuthCachedIn(base, spec(URL_B)), false);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("auth cached: version-dir name does not matter, only the URL hash", () => {
  const base = tempAuthBase();
  try {
    const dir = path.join(base, "mcp-remote-9.9.9");
    mkdirSync(dir);
    writeFileSync(path.join(dir, `${serverUrlHash(URL_B)}_tokens.json`), "{}");
    assert.equal(interactiveAuthCachedIn(base, spec(URL_B)), true);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("auth cached: client_info/code_verifier without tokens.json does not count", () => {
  const base = tempAuthBase();
  try {
    const dir = path.join(base, "mcp-remote-0.1.36");
    mkdirSync(dir);
    writeFileSync(path.join(dir, `${serverUrlHash(URL_A)}_client_info.json`), "{}");
    writeFileSync(path.join(dir, `${serverUrlHash(URL_A)}_code_verifier.txt`), "x");
    assert.equal(interactiveAuthCachedIn(base, spec(URL_A)), false);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("auth cached: spec without a remote URL falls back to any-token scan", () => {
  const base = tempAuthBase();
  try {
    const dir = path.join(base, "mcp-remote-0.1.36");
    mkdirSync(dir);
    writeFileSync(path.join(dir, "deadbeef_tokens.json"), "{}");
    assert.equal(interactiveAuthCachedIn(base, spec()), true);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("auth cached: missing base dir is false", () => {
  assert.equal(interactiveAuthCachedIn(path.join(tmpdir(), "chho2-no-such-dir"), spec(URL_A)), false);
});
