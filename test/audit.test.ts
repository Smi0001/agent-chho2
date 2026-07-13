import { test } from "node:test";
import assert from "node:assert/strict";
import { redact } from "../src/audit/logger.js";

test("redact masks secret-like keys recursively", () => {
  const input = {
    token: "abc",
    ok: 1,
    nested: { apiKey: "x", authorization: "Bearer y", fine: "z" },
    arr: [{ password: "p" }, { note: "n" }],
  };
  const out = redact(input) as {
    token: string;
    ok: number;
    nested: { apiKey: string; authorization: string; fine: string };
    arr: Array<{ password?: string; note?: string }>;
  };
  assert.equal(out.token, "[redacted]");
  assert.equal(out.ok, 1);
  assert.equal(out.nested.apiKey, "[redacted]");
  assert.equal(out.nested.authorization, "[redacted]");
  assert.equal(out.nested.fine, "z");
  assert.equal(out.arr[0]!.password, "[redacted]");
  assert.equal(out.arr[1]!.note, "n");
});

test("redact passes through primitives and null", () => {
  assert.equal(redact("hi"), "hi");
  assert.equal(redact(5), 5);
  assert.equal(redact(null), null);
  assert.equal(redact(undefined), undefined);
});
