import test from "node:test";
import assert from "node:assert/strict";
import { spawn as nodeSpawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { queryCodexImageModels } from "../src/providers/codex-model-catalog.mjs";

const model = (id = "available-driver") => ({ id, model: id, isDefault: true, defaultReasoningEffort: "medium", supportedReasoningEfforts: [{ reasoningEffort: "medium", description: "private description" }], account: "private account" });
function fixture(reply) {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stdin = new PassThrough();
  child.stderr = new PassThrough();
  const calls = [], requests = [], killed = [];
  child.kill = (signal) => { killed.push(signal); child.emit("close", null); return true; };
  child.stdin.setEncoding("utf8");
  child.stdin.on("data", (chunk) => {
    const request = JSON.parse(chunk);
    requests.push(request);
    queueMicrotask(() => {
      const result = reply(request, child);
      if (result !== undefined) child.stdout.write(`${JSON.stringify({ id: request.id, result })}\n`);
    });
  });
  const spawn = (...args) => { calls.push(args); return child; };
  const options = { spawn, executable: "/official/codex", cwd: "/safe/run", env: { CODEX_HOME: "/official/home" }, configArgs: ["-c", 'model_provider="openai"'] };
  return { child, calls, requests, killed, options };
}

test("reads all pages using only metadata RPC and projects clean primitive metadata", async () => {
  const f = fixture((request) => {
    if (request.method === "initialize") return { userAgent: "private" };
    if (request.method === "model/list") return request.params.cursor ? { data: [{ ...model("second"), isDefault: false }], nextCursor: null } : { data: [model()], nextCursor: "page-two" };
  });
  assert.deepEqual(await queryCodexImageModels(f.options), [
    { id: "available-driver", isDefault: true, defaultReasoningEffort: "medium", supportedReasoningEfforts: ["medium"] },
    { id: "second", isDefault: false, defaultReasoningEffort: "medium", supportedReasoningEfforts: ["medium"] },
  ]);
  assert.deepEqual(f.calls, [[f.options.executable, ["app-server", "--listen", "stdio://", ...f.options.configArgs], { cwd: f.options.cwd, env: f.options.env, shell: false, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] }]]);
  assert.deepEqual(f.requests.map((r) => r.method), ["initialize", "initialized", "model/list", "model/list"]);
  assert.equal(f.requests[2].params.includeHidden, true);
  assert.equal(f.requests[3].params.cursor, "page-two");
  assert.deepEqual(f.killed, ["SIGTERM"]);
});

test("empty catalog remains empty for caller policy", async () => {
  const f = fixture((r) => r.method === "initialize" ? {} : r.method === "model/list" ? { data: [], nextCursor: null } : undefined);
  assert.deepEqual(await queryCodexImageModels(f.options), []);
});

for (const [name, page] of Object.entries({
  "missing data": {}, "invalid cursor": { data: [], nextCursor: 4 },
  "missing model slug": { data: [{ ...model(), model: undefined }], nextCursor: null },
  "empty model slug": { data: [{ ...model(), model: " " }], nextCursor: null },
  "invalid default": { data: [{ ...model(), isDefault: "true" }], nextCursor: null },
  "invalid efforts": { data: [{ ...model(), supportedReasoningEfforts: ["medium"] }], nextCursor: null },
  "repeated cursor": { data: [], nextCursor: "same" },
})) test(`rejects ${name} without leaking response data`, async () => {
  const f = fixture((r) => r.method === "initialize" ? {} : r.method === "model/list" ? page : undefined);
  await assert.rejects(queryCodexImageModels(f.options), /无法读取官方 Codex 模型目录；未发起生成请求。/);
  assert.deepEqual(f.killed, ["SIGTERM"]);
});

for (const failure of ["json", "rpc", "close", "error", "stdin", "stdout"])
  test(`sanitizes ${failure} failure and closes only the owned child`, async () => {
    const f = fixture((r, child) => {
      if (r.method !== "initialize") return;
      child.stderr.write("private stderr account details");
      if (failure === "json") child.stdout.write("private invalid json\n");
      if (failure === "rpc") child.stdout.write(JSON.stringify({ id: r.id, error: { message: "private secret" } }) + "\n");
      if (failure === "close") child.emit("close", 1);
      if (failure === "error") child.emit("error", new Error("private secret"));
      if (failure === "stdin") child.stdin.emit("error", new Error("private secret"));
      if (failure === "stdout") child.stdout.emit("error", new Error("private secret"));
    });
    await assert.rejects(queryCodexImageModels(f.options), /无法读取官方 Codex 模型目录；未发起生成请求。/);
    assert.deepEqual(f.killed, ["SIGTERM"]);
  });

test("abort closes pending lookup and pre-aborted lookup does not spawn", async () => {
  const f = fixture(() => undefined);
  const controller = new AbortController();
  const pending = queryCodexImageModels({ ...f.options, signal: controller.signal });
  controller.abort();
  await assert.rejects(pending);
  assert.deepEqual(f.killed, ["SIGTERM"]);
  await assert.rejects(queryCodexImageModels({ ...f.options, signal: controller.signal }));
  assert.equal(f.calls.length, 1);
});

test("spawn failures do not expose exception data", async () => {
  await assert.rejects(queryCodexImageModels({ spawn() { throw new Error("private path"); }, executable: "codex" }), /无法读取官方 Codex 模型目录；未发起生成请求。/);
});


test("reads newline-delimited responses from an owned real subprocess", async () => {
  let child;
  const script = `
    const readline = require("node:readline");
    readline.createInterface({ input: process.stdin }).on("line", line => {
      const request = JSON.parse(line);
      if (request.method === "initialized") return;
      const result = request.method === "initialize" ? {} : { data: [], nextCursor: null };
      process.stdout.write(JSON.stringify({ id: request.id, result }) + "\\n");
    });
  `;
  const result = await queryCodexImageModels({
    executable: "fixture-only",
    spawn(_executable, _args, options) {
      child = nodeSpawn(process.execPath, ["-e", script], options);
      return child;
    },
  });
  assert.deepEqual(result, []);
  assert.ok(child.exitCode !== null || child.signalCode !== null);
  if (child.exitCode === null && child.signalCode === null) await new Promise((resolve) => child.once("close", resolve));
});


test("returns CLI model slug rather than directory record id", async () => {
  const f = fixture((r) => r.method === "initialize" ? {} : r.method === "model/list" ? { data: [{ ...model("directory-record"), model: "actual-cli-model" }], nextCursor: null } : undefined);
  assert.deepEqual(await queryCodexImageModels(f.options), [{ id: "actual-cli-model", isDefault: true, defaultReasoningEffort: "medium", supportedReasoningEfforts: ["medium"] }]);
});

test('RPC failures retain a safe actionable category without leaking diagnostic text', async () => {
  const f = fixture((r, child) => {
    if (r.method === 'initialize') return {};
    if (r.method === 'model/list') child.stdout.write(JSON.stringify({ id: r.id, error: { message: 'ENOTFOUND private-account@example.com sk-private' } }) + '\n');
  });
  await assert.rejects(queryCodexImageModels(f.options), error => {
    assert.equal(error.code, 'network');
    assert.match(error.message, /网络/);
    assert.doesNotMatch(error.message, /private|sk-/);
    return true;
  });
});

test('completed catalog survives cleanup error and terminates its owned child', async () => {
  const f = fixture(r => r.method === 'initialize' ? {} : r.method === 'model/list' ? { data: [model()], nextCursor: null } : undefined);
  const warnings = [];
  const result = await queryCodexImageModels({ ...f.options, stop: async () => { throw new Error('private OS diagnostic'); }, onCleanupError: warning => warnings.push(warning) });
  assert.equal(result.length, 1);
  assert.deepEqual(f.killed, ['SIGTERM']);
  assert.equal(warnings[0].code, 'cleanup');
  assert.doesNotMatch(warnings[0].message, /private/);
});


