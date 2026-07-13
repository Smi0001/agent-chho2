import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { ConfigSchema } from "../src/config/schema.js";
import { expandHome, loadDotEnv } from "../src/config/loader.js";

test("ConfigSchema applies defaults on empty input", () => {
  const c = ConfigSchema.parse({});
  assert.equal(c.provider.id, "claude-agent");
  assert.equal(c.provider.model, "claude-opus-4-8");
  assert.equal(c.outputStyle, "normal");
  assert.equal(c.permissions.mode, "ask");
  assert.equal(c.permissions.promptTimeoutSeconds, 10);
  assert.deepEqual(c.notify.channels, ["email", "slack"]);
  assert.equal(c.audit.format, "jsonl");
});

test("ConfigSchema merges a partial override with inner defaults", () => {
  const c = ConfigSchema.parse({ permissions: { mode: "auto" }, outputStyle: "terse" });
  assert.equal(c.permissions.mode, "auto");
  assert.equal(c.permissions.promptTimeoutSeconds, 10); // inner default preserved
  assert.equal(c.outputStyle, "terse");
});

test("expandHome expands a leading ~", () => {
  assert.equal(expandHome("~"), os.homedir());
  assert.equal(expandHome("~/x/y"), path.join(os.homedir(), "x/y"));
  assert.equal(expandHome("/abs/path"), "/abs/path");
});

test("loadDotEnv loads KEY=VALUE and never overwrites existing env", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "chho2-env-"));
  process.env.CHHO2_TEST_EXISTING = "keep";
  delete process.env.CHHO2_TEST_A;
  await fs.writeFile(
    path.join(dir, ".env"),
    'CHHO2_TEST_A=hello\n# a comment\nCHHO2_TEST_B="quoted"\nCHHO2_TEST_EXISTING=changed\n',
  );
  await loadDotEnv(dir);
  assert.equal(process.env.CHHO2_TEST_A, "hello");
  assert.equal(process.env.CHHO2_TEST_B, "quoted");
  assert.equal(process.env.CHHO2_TEST_EXISTING, "keep"); // not overwritten

  delete process.env.CHHO2_TEST_A;
  delete process.env.CHHO2_TEST_B;
  delete process.env.CHHO2_TEST_EXISTING;
  await fs.rm(dir, { recursive: true, force: true });
});
