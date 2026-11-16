import test from "node:test";
import assert from "node:assert/strict";
import { classifyCodexFailure } from "../src/providers/codex-diagnostics.mjs";

test("native error events classify model failures without persisting raw diagnostics", () => {
  const result = classifyCodexFailure(JSON.stringify({ type: "turn.failed", error: { message: "The model gpt-example is not supported. Bearer private-token sk-private-secret user@example.test" } }), "", 1);
  assert.equal(result.code, "model-unavailable");
  assert.match(result.message, /驱动模型/);
  assert.equal(JSON.stringify(result).includes("private"), false);
  assert.equal(JSON.stringify(result).includes("user@example"), false);
});

test("authentication, quota, rate, network and local permission failures remain distinct", () => {
  for (const [text, code] of [
    ["401 Unauthorized invalid access token", "authentication"],
    ["insufficient_quota", "quota"],
    ["429 Too Many Requests", "rate-limit"],
    ["certificate verify failed", "tls"],
    ["stream disconnected before completion ECONNRESET", "network"],
    ["403 Forbidden", "permission"],
    ["unexpected argument --feature", "cli-version"],
    ["error loading config", "configuration"],
  ]) assert.equal(classifyCodexFailure("", text, 1).code, code);
});

test("unknown and malformed CLI output never becomes an unredacted user-facing diagnostic", () => {
  const result = classifyCodexFailure('null\nnot-json\n{"type":"item.completed","item":{"text":"model not found in this story"}}', "secret unexpected text user@example.test", 2);
  assert.equal(result.code, "unknown");
  assert.match(result.message, /2/);
  assert.equal(JSON.stringify(result).includes("secret"), false);
  assert.equal(JSON.stringify(result).includes("story"), false);
});
