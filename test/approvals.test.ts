import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadApprovals, approvedForRole, persistApproval } from "../src/permissions/approvals.js";
import { timeoutChoice } from "../src/orchestrator.js";

function tempFile(): { file: string; cleanup: () => void } {
  const dir = mkdtempSync(path.join(tmpdir(), "chho2-approvals-"));
  return { file: path.join(dir, "approvals.json"), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test("approvals: missing file means none", () => {
  const { file, cleanup } = tempFile();
  try {
    assert.deepEqual(loadApprovals(file), {});
    assert.deepEqual(approvedForRole("qa", file), []);
  } finally {
    cleanup();
  }
});

test("approvals: persist round-trips, dedupes, sorts, scopes per role", () => {
  const { file, cleanup } = tempFile();
  try {
    persistApproval("qa", "atlassian.addCommentToJiraIssue", file);
    persistApproval("qa", "github.add_issue_comment", file);
    persistApproval("qa", "atlassian.addCommentToJiraIssue", file); // duplicate
    persistApproval("dev", "github.create_pull_request", file);
    assert.deepEqual(approvedForRole("qa", file), [
      "atlassian.addCommentToJiraIssue",
      "github.add_issue_comment",
    ]);
    // Per-role scope: qa's approval does not leak to dev.
    assert.deepEqual(approvedForRole("dev", file), ["github.create_pull_request"]);
    assert.equal(approvedForRole("dev", file).includes("atlassian.addCommentToJiraIssue"), false);
  } finally {
    cleanup();
  }
});

test("approvals: corrupt or wrong-shape file counts as none and is recoverable", () => {
  const { file, cleanup } = tempFile();
  try {
    writeFileSync(file, "not json {{{");
    assert.deepEqual(loadApprovals(file), {});
    writeFileSync(file, JSON.stringify(["a", "b"]));
    assert.deepEqual(loadApprovals(file), {});
    writeFileSync(file, JSON.stringify({ qa: "not-a-list", dev: ["ok.tool", 42] }));
    assert.deepEqual(loadApprovals(file), { dev: ["ok.tool"] });
    // A persist after corruption rewrites a valid file.
    persistApproval("qa", "atlassian.addCommentToJiraIssue", file);
    assert.deepEqual(approvedForRole("qa", file), ["atlassian.addCommentToJiraIssue"]);
  } finally {
    cleanup();
  }
});

test("timeoutChoice: proceed allows once, wait and deny both deny", () => {
  assert.equal(timeoutChoice("proceed"), "once");
  assert.equal(timeoutChoice("deny"), "deny");
  assert.equal(timeoutChoice("wait"), "deny");
});
