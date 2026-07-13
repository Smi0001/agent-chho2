import { test } from "node:test";
import assert from "node:assert/strict";
import {
  missingRequiredEnv,
  prunedLaunchArgs,
  resolveCapabilities,
  CAPABILITIES,
} from "../src/mcp/registry.js";

test("resolveCapabilities splits known from unknown", () => {
  const { resolved, unknown } = resolveCapabilities(["playwright", "nope"]);
  assert.deepEqual(resolved.map((r) => r.name), ["playwright"]);
  assert.deepEqual(unknown, ["nope"]);
});

test("missingRequiredEnv reports absent required vars", () => {
  const github = CAPABILITIES.github!;
  const saved = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
  delete process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
  assert.deepEqual(missingRequiredEnv(github), ["GITHUB_PERSONAL_ACCESS_TOKEN"]);
  process.env.GITHUB_PERSONAL_ACCESS_TOKEN = "x";
  assert.deepEqual(missingRequiredEnv(github), []);
  if (saved === undefined) delete process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
  else process.env.GITHUB_PERSONAL_ACCESS_TOKEN = saved;
});

test("prunedLaunchArgs drops -e pairs only for unset vars", () => {
  const savedTok = process.env.GITLAB_PERSONAL_ACCESS_TOKEN;
  const savedUrl = process.env.GITLAB_API_URL;
  process.env.GITLAB_PERSONAL_ACCESS_TOKEN = "tok";
  delete process.env.GITLAB_API_URL;
  const args = [
    "run", "-i", "--rm",
    "-e", "GITLAB_PERSONAL_ACCESS_TOKEN",
    "-e", "GITLAB_API_URL",
    "img",
  ];
  assert.deepEqual(prunedLaunchArgs(args), [
    "run", "-i", "--rm",
    "-e", "GITLAB_PERSONAL_ACCESS_TOKEN",
    "img",
  ]);
  if (savedTok === undefined) delete process.env.GITLAB_PERSONAL_ACCESS_TOKEN;
  else process.env.GITLAB_PERSONAL_ACCESS_TOKEN = savedTok;
  if (savedUrl === undefined) delete process.env.GITLAB_API_URL;
  else process.env.GITLAB_API_URL = savedUrl;
});

test("prunedLaunchArgs keeps -e VAR=value literals untouched", () => {
  assert.deepEqual(prunedLaunchArgs(["-e", "FOO=bar"]), ["-e", "FOO=bar"]);
});
