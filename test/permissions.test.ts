import { test } from "node:test";
import assert from "node:assert/strict";
import { isOutwardWrite, canonicalToolName } from "../src/mcp/registry.js";
import { decide, sessionScopes } from "../src/permissions/policy.js";
import type { PermissionsConfig } from "../src/config/schema.js";

// --- write classification (the security-critical gate) ---

test("isOutwardWrite: explicit write-list servers", () => {
  assert.equal(isOutwardWrite("atlassian.addCommentToJiraIssue"), true);
  assert.equal(isOutwardWrite("atlassian.getJiraIssue"), false);
  assert.equal(isOutwardWrite("github.create_pull_request"), true);
  assert.equal(isOutwardWrite("github.get_issue"), false);
  assert.equal(isOutwardWrite("gitea.pull_request_write"), true);
});

test("isOutwardWrite: playwright browser tools are reads (never gated)", () => {
  assert.equal(isOutwardWrite("playwright.browser_navigate"), false);
  assert.equal(isOutwardWrite("playwright.browser_click"), false);
});

test("isOutwardWrite: mcp__ namespaced form is handled", () => {
  assert.equal(isOutwardWrite("mcp__atlassian__addCommentToJiraIssue"), true);
  assert.equal(isOutwardWrite("mcp__atlassian__getJiraIssue"), false);
});

test("isOutwardWrite: uncurated server uses write-biased read heuristic", () => {
  // gitlab is not in WRITE_TOOLS, so the name heuristic decides.
  assert.equal(isOutwardWrite("gitlab.create_merge_request"), true);
  assert.equal(isOutwardWrite("gitlab.list_projects"), false);
  assert.equal(isOutwardWrite("gitlab.get_merge_request"), false);
});

test("isOutwardWrite: built-in (non-MCP) tools are never outward", () => {
  assert.equal(isOutwardWrite("Bash"), false);
  assert.equal(isOutwardWrite("Read"), false);
});

test("canonicalToolName normalizes both namings", () => {
  assert.equal(
    canonicalToolName("mcp__atlassian__addCommentToJiraIssue"),
    "atlassian.addCommentToJiraIssue",
  );
  assert.equal(canonicalToolName("atlassian.getJiraIssue"), "atlassian.getJiraIssue");
  assert.equal(canonicalToolName("Bash"), "Bash");
});

// --- permission policy ---

const base: PermissionsConfig = { mode: "ask", promptTimeoutSeconds: 10, onTimeout: "wait" };

test("decide: reads are always allowed", () => {
  const r = decide({ ...base }, { action: "atlassian.getJiraIssue", outward: false, summary: "" }, []);
  assert.equal(r, "allow");
});

test("decide: ask mode prompts on outward writes", () => {
  const r = decide(
    { ...base, mode: "ask" },
    { action: "atlassian.addCommentToJiraIssue", outward: true, summary: "" },
    [],
  );
  assert.equal(r, "ask");
});

test("decide: auto mode allows outward writes", () => {
  const r = decide(
    { ...base, mode: "auto" },
    { action: "atlassian.addCommentToJiraIssue", outward: true, summary: "" },
    [],
  );
  assert.equal(r, "allow");
});

test("decide: allowlist mode allows listed, asks unlisted", () => {
  const allow = ["atlassian.addCommentToJiraIssue"];
  assert.equal(
    decide({ ...base, mode: "allowlist" }, { action: "atlassian.addCommentToJiraIssue", outward: true, summary: "" }, allow),
    "allow",
  );
  assert.equal(
    decide({ ...base, mode: "allowlist" }, { action: "github.create_pull_request", outward: true, summary: "" }, allow),
    "ask",
  );
});

test("sessionScopes dedups", () => {
  assert.deepEqual(sessionScopes(["a", "a", "b"]).sort(), ["a", "b"]);
});
