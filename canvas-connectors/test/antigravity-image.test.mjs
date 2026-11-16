import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough, Readable, Writable } from "node:stream";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import * as acp from "@agentclientprotocol/sdk";
import { PNG } from "pngjs";
import { checkAntigravityImage, loginAntigravity, startAntigravityImage, readAntigravityImageArtifacts } from "../src/providers/antigravity-image.mjs";
import { createLocalCliProviders } from "../src/providers/local-cli.mjs";

const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4AWP4DwQACfsD/c8LaHIAAAAASUVORK5CYII=";
const image = { type: "image", mimeType: "image/png", data: png };
const permission = { sessionId: "native-session", toolCall: { toolCallId: "one", title: "generate_image", kind: "other", status: "pending", rawInput: { tool: "generate_image" } }, options: [{ optionId: "allow", kind: "allow_once", name: "Allow" }, { optionId: "reject", kind: "reject_once", name: "Reject" }] };

async function fixture(t, behavior = {}) {
  const cwd = await mkdtemp(join(tmpdir(), "canvas-agy-acp-"));
  const calls = [], requests = [], killed = [];
  const options = {
    executable: "agy.exe", cwd, homeDir: cwd, env: {},
    spawn(executable, args, spawnOptions) {
      const child = new EventEmitter();
      Object.assign(child, { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), exitCode: null });
      calls.push({ executable, args, options: spawnOptions, child });
      const app = acp.agent({ name: "fixture-agent" })
        .onRequest("initialize", ({ params }) => {
          requests.push({ method: "initialize", params });
          return { protocolVersion: acp.PROTOCOL_VERSION, agentInfo: { name: behavior.agentName || "Antigravity ACP Server", version: behavior.version || "1.5.6" }, agentCapabilities: { promptCapabilities: { image: true } }, authMethods: behavior.authMethods ?? [{ id: "oauth-personal", name: "Google" }] };
        })
        .onRequest("authenticate", ({ params }) => { requests.push({ method: "authenticate", params }); return {}; })
        .onRequest("session/new", ({ params }) => {
          requests.push({ method: "session/new", params });
          if (behavior.unauthenticated) throw new acp.RequestError(-32000, "Authentication required private@example.com");
          return { sessionId: behavior.sessionId || "native-session", _meta: { antigravity: { tier: { id: "g1-pro-tier", name: "Google AI Pro" } } } };
        })
        .onRequest("session/prompt", async ({ params, client, signal }) => {
          requests.push({ method: "session/prompt", params });
          if (behavior.prompt) return behavior.prompt({ params, client, signal });
          await client.notify("session/update", { sessionId: "native-session", update: { sessionUpdate: "tool_call", toolCallId: "one", name: "generate_image", title: "Run generate_image", kind: "other", status: "completed", rawInput: { Prompt: "draw", ImageName: "image" } } });
          await client.notify("session/update", { sessionId: "native-session", update: { sessionUpdate: "tool_call_update", toolCallId: "one", status: "completed", content: [{ type: "content", content: image }] } });
          return { stopReason: "end_turn" };
        })
        .onNotification("session/cancel", ({ params }) => { requests.push({ method: "session/cancel", params }); });
      child.connection = app.connect(acp.ndJsonStream(Writable.toWeb(child.stdout), Readable.toWeb(child.stdin)));
      return child;
    },
    async kill(child) {
      if (child.exitCode !== null) return;
      killed.push(child);
      child.connection.close();
      child.stdin.destroy(); child.stdout.destroy(); child.stderr.destroy();
      child.exitCode = 0;
      child.emit("close", 0);
    },
  };
  t.after(async () => { await Promise.all(calls.map(({ child }) => options.kill(child))); await rm(cwd, { force: true, recursive: true }); });
  return { options, calls, requests, killed, cwd };
}

test("check uses initialized image-generator session without prompts, credentials, fs or terminal capabilities", async (t) => {
  const f = await fixture(t);
  const result = await checkAntigravityImage(f.options);
  assert.equal(result.loginState, "authenticated");
  assert.equal(result.imageAvailable, true);
  assert.equal(result.imageAdapter, "antigravity-acp");
  assert.deepEqual(f.requests.map(r => r.method), ["initialize", "session/new"]);
  assert.equal(f.requests[0].params.clientCapabilities.fs.readTextFile, false);
  assert.equal(f.requests[0].params.clientCapabilities.fs.writeTextFile, false);
  assert.equal(f.requests[0].params.clientCapabilities.terminal, false);
  assert.deepEqual(f.requests[1].params.mcpServers, []);
  assert.equal(f.calls[0].args.includes("canvas-native-image"), true);
  assert.equal(f.calls[0].args.some(a => /yolo|skip-permissions/.test(a)), false);
  assert.equal(f.killed.length, 1);
});

test("membership subprocess removes API and cloud auth environment overrides without changing caller environment", async (t) => {
  const f = await fixture(t);
  f.options.env = { PATH: "preserved", GEMINI_API_KEY: "private", GOOGLE_API_KEY: "private", GOOGLE_APPLICATION_CREDENTIALS: "private", GOOGLE_CLOUD_PROJECT: "private", GOOGLE_CLOUD_LOCATION: "private", GOOGLE_GENAI_USE_VERTEXAI: "true", AGY_ADC_AUTH: "true", GOOGLE_CLOUD_QUOTA_PROJECT: "private", GOOGLE_GEMINI_BASE_URL: "private" };
  await checkAntigravityImage(f.options);
  assert.deepEqual(f.calls[0].options.env, { PATH: "preserved" });
  assert.equal(f.options.env.GEMINI_API_KEY, "private");
});

test("auth errors and foreign servers never report image availability or expose account diagnostics", async (t) => {
  const f = await fixture(t, { unauthenticated: true });
  const result = await checkAntigravityImage(f.options);
  assert.equal(result.loginState, "not-authenticated");
  assert.equal(result.imageAvailable, false);
  assert.equal(JSON.stringify(result).includes("private@"), false);
  assert.equal(f.killed.length, 1);
  const old = await fixture(t, { agentName: "unrelated-agent" });
  assert.equal((await checkAntigravityImage(old.options)).imageAvailable, false);
});

test("native artifact metadata is bound to the actual completed image tool, session and creation time", async (t) => {
  const f = await fixture(t);
  const sessionId = "dd1ad2ae-0503-438e-837d-bbf737070afc";
  const root = join(f.cwd, ".gemini/antigravity-cli/brain", sessionId);
  await mkdir(join(root, ".system_generated/logs"), { recursive: true });
  const file = join(root, "native-result.png");
  const startedAt = Date.now();
  await writeFile(file, Buffer.from(png, "base64"));
  const rawInput = { Prompt: "a blue circle", ImageName: "blue_circle", AspectRatio: "1:1" };
  const calls = [{ toolCallId: "real-tool", name: "generate_image", status: "completed", rawInput }];
  const rows = [{ step_index: 1, source: "MODEL", type: "PLANNER_RESPONSE", status: "DONE", tool_calls: [{ name: "generate_image", args: rawInput }] }, { step_index: 2, source: "MODEL", type: "GENERIC", status: "DONE", created_at: new Date(startedAt).toISOString(), media: [{ mime_type: "image/png", uri: pathToFileURL(file).href }] }];
  const manifest = join(root, ".system_generated/logs/transcript_full.jsonl");
  const save = () => writeFile(manifest, rows.map(row => JSON.stringify(row)).join("\n"));
  await save();
  const options = { homeDir: f.cwd, sessionId, startedAt, calls };
  assert.equal((await readAntigravityImageArtifacts(options))[0].data, png);
  await assert.rejects(readAntigravityImageArtifacts({ ...options, calls: [{ ...calls[0], status: "failed" }] }), /图片/);
  rows[1].media[0].uri = pathToFileURL(join(f.cwd, "outside.png")).href;
  await writeFile(join(f.cwd, "outside.png"), Buffer.from(png, "base64")); await save();
  await assert.rejects(readAntigravityImageArtifacts(options), /图片/);
  rows[1].media[0].uri = pathToFileURL(file).href; await save();
  await utimes(file, new Date(0), new Date(0));
  await assert.rejects(readAntigravityImageArtifacts(options), /图片/);
  await utimes(file, new Date(), new Date());
  rows[1].created_at = "invalid timestamp"; await save();
  await assert.rejects(readAntigravityImageArtifacts(options), /图片/);
});

test("login requests only the advertised personal OAuth method", async (t) => {
  const f = await fixture(t);
  await loginAntigravity(f.options);
  assert.deepEqual(f.requests.map(r => r.method), ["initialize", "authenticate"]);
  assert.deepEqual(f.requests[1].params, { methodId: "oauth-personal" });
  assert.equal(f.killed.length, 1);
  const unsupported = await fixture(t, { authMethods: [{ id: "gemini-api-key", name: "API" }] });
  await assert.rejects(loginAntigravity(unsupported.options), /Google|登录/);
  assert.equal(unsupported.requests.some(r => r.method === "authenticate"), false);
});

test("image content is decoded, persisted, and references use standard ACP content", async (t) => {
  const f = await fixture(t);
  let session;
  const reference = { ...image, data: PNG.sync.write(new PNG({ width: 1, height: 1 })).toString("base64") };
  const run = startAntigravityImage({ ...f.options, prompt: "a green circle", references: [reference], onSession: async (id) => { session = id; } });
  const { outputs } = await run.completion;
  assert.equal(session, "native-session");
  assert.equal(outputs.length, 1);
  assert.equal(outputs[0].mimeType, "image/png");
  assert.deepEqual(await readFile(outputs[0].path), Buffer.from(png, "base64"));
  const prompt = f.requests.find(r => r.method === "session/prompt").params.prompt;
  assert.deepEqual(prompt[1], reference);
  assert.equal(f.killed.length, 1);
});

test("wrapped tool images are supported and repeated previews are deduplicated", async (t) => {
  const f = await fixture(t, { prompt: async ({ client }) => {
    for (let i = 0; i < 2; i++) await client.notify("session/update", { sessionId: "native-session", update: { sessionUpdate: "tool_call_update", toolCallId: "one", name: "generate_image", status: "completed", content: [{ type: "content", content: image }] } });
    return { stopReason: "end_turn" };
  } });
  assert.equal((await startAntigravityImage({ ...f.options, prompt: "draw" }).completion).outputs.length, 1);
});

test("unknown permissions are rejected, including titles claiming generate_image", async (t) => {
  let outcome;
  const f = await fixture(t, { prompt: async ({ client }) => {
    outcome = await client.request("session/request_permission", permission);
    return { stopReason: "end_turn" };
  } });
  await assert.rejects(startAntigravityImage({ ...f.options, prompt: "draw" }).completion, /权限|图片/);
  assert.deepEqual(outcome, { outcome: { outcome: "selected", optionId: "reject" } });
  assert.deepEqual(await readdir(f.cwd), []);
});

test("only the native generate_image machine name with scoped arguments receives one-time permission", async (t) => {
  let outcome;
  const f = await fixture(t, { prompt: async ({ client }) => {
    outcome = await client.request("session/request_permission", { ...permission, toolCall: { ...permission.toolCall, name: "generate_image", rawInput: { Prompt: "a circle", ImageName: "circle", AspectRatio: "1:1" } } });
    await client.notify("session/update", { sessionId: "native-session", update: { sessionUpdate: "tool_call_update", toolCallId: "one", name: "generate_image", status: "completed", content: [{ type: "content", content: image }] } });
    return { stopReason: "end_turn" };
  } });
  await startAntigravityImage({ ...f.options, prompt: "draw" }).completion;
  assert.deepEqual(outcome, { outcome: { outcome: "selected", optionId: "allow" } });
});

test("unbound agent image chunks never count as native generated images", async (t) => {
  const f = await fixture(t, { prompt: async ({ client }) => {
    await client.notify("session/update", { sessionId: "native-session", update: { sessionUpdate: "agent_message_chunk", content: image } });
    await client.notify("session/update", { sessionId: "native-session", update: { sessionUpdate: "tool_call_update", toolCallId: "one", name: "generate_image", status: "completed" } });
    return { stopReason: "end_turn" };
  } });
  await assert.rejects(startAntigravityImage({ ...f.options, prompt: "draw" }).completion, /图片/);
});

test("text claims, truncated bytes and unsuccessful turns never become saved image results", async (t) => {
  for (const content of [{ type: "text", text: "Image saved to C:/secret/output.png" }, { ...image, data: Buffer.from("invalid png").toString("base64") }]) {
    const f = await fixture(t, { prompt: async ({ client }) => {
      await client.notify("session/update", { sessionId: "native-session", update: { sessionUpdate: "agent_message_chunk", content } });
      return { stopReason: "end_turn" };
    } });
    await assert.rejects(startAntigravityImage({ ...f.options, prompt: "draw" }).completion, /图片/);
    assert.deepEqual(await readdir(f.cwd), []);
  }
});

test("abort closes the owned process and never sends another prompt", async (t) => {
  let entered;
  const ready = new Promise(resolve => { entered = resolve; });
  const f = await fixture(t, { prompt: async ({ signal }) => { entered(); await new Promise(resolve => signal.addEventListener("abort", resolve, { once: true })); return { stopReason: "cancelled" }; } });
  const controller = new AbortController();
  const run = startAntigravityImage({ ...f.options, prompt: "draw", signal: controller.signal });
  const rejected = assert.rejects(run.completion);
  await ready;
  controller.abort();
  await rejected;
  assert.equal(f.killed.length, 1);
  assert.equal(f.requests.filter(r => r.method === "session/prompt").length, 1);
});

test("cancellation kills the owned process even when ACP stdin is backpressured", async (t) => {
  let entered;
  const ready = new Promise(resolve => { entered = resolve; });
  const f = await fixture(t, { prompt: async ({ signal }) => { entered(); await new Promise(resolve => signal.addEventListener("abort", resolve, { once: true })); return { stopReason: "cancelled" }; } });
  const run = startAntigravityImage({ ...f.options, prompt: "draw" });
  const completion = assert.rejects(run.completion);
  await ready;
  run.child.stdin._writableState.highWaterMark = 1;
  run.child.stdin._write = (_chunk, _encoding, _callback) => {};
  const cancellation = run.cancel();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.killed.length, 1, "Cancellation must not wait for the cancel notification to flush");
  await cancellation;
  await completion;
});

async function providerFixture(t, behavior = {}) {
  const f = await fixture(t, behavior);
  const executable = join(f.cwd, process.platform === "win32" ? "agy.exe" : "agy");
  await writeFile(executable, "fixture only", { mode: 0o700 });
  const ctx = { dataDir: f.cwd, homeDir: f.cwd, spawn: f.options.spawn, killCliProcess: f.options.kill, env: {} };
  const provider = createLocalCliProviders(ctx).find(p => p.id === "antigravity-cli");
  provider.check = async () => ({ state: "ready", details: { executable, imageAvailable: true, imageAdapter: "antigravity-acp" } });
  const job = { id: "durable-image", provider: provider.id, preset: { action: "image", model: "antigravity-image-default", params: {} }, prompt: "a circle", inputs: [] };
  t.after(() => provider.close());
  return { ...f, ctx, provider, job };
}

test("provider saves native session and outputs, and restart never resubmits an existing image job", async (t) => {
  const f = await providerFixture(t);
  const submitted = await f.provider.submit({}, f.job);
  assert.equal(submitted.status, "running");
  f.job.remoteId = submitted.remoteId;
  let result;
  do { await new Promise(resolve => setImmediate(resolve)); result = await f.provider.query({}, f.job); } while (result.status === "running");
  assert.equal(result.status, "succeeded", JSON.stringify(result));
  const record = JSON.parse(await readFile(join(f.cwd, "cli-results/durable-image/run.json"), "utf8"));
  assert.equal(record.nativeSessionId, "native-session");
  const restarted = createLocalCliProviders(f.ctx).find(p => p.id === "antigravity-cli");
  assert.deepEqual(await restarted.submit({}, f.job), result);
  assert.deepEqual(await restarted.query({}, f.job), result);
  assert.equal(f.requests.filter(r => r.method === "session/prompt").length, 1);
});

test("provider imports verified native transcript media when ACP tool updates contain no image bytes", async (t) => {
  const sessionId = "dd1ad2ae-0503-438e-837d-bbf737070afc";
  let f;
  f = await providerFixture(t, { sessionId, prompt: async ({ client }) => {
    const rawInput = { Prompt: "a circle", ImageName: "circle", AspectRatio: "1:1" };
    const root = join(f.cwd, ".gemini/antigravity-cli/brain", sessionId);
    await mkdir(join(root, ".system_generated/logs"), { recursive: true });
    const path = join(root, "generated-circle.png");
    await writeFile(path, Buffer.from(png, "base64"));
    const rows = [{ step_index: 1, source: "MODEL", type: "PLANNER_RESPONSE", status: "DONE", tool_calls: [{ name: "generate_image", args: rawInput }] }, { step_index: 2, source: "MODEL", type: "GENERIC", status: "DONE", created_at: new Date().toISOString(), media: [{ mime_type: "image/png", uri: pathToFileURL(path).href }] }];
    await writeFile(join(root, ".system_generated/logs/transcript_full.jsonl"), rows.map(JSON.stringify).join("\n"));
    await client.notify("session/update", { sessionId, update: { sessionUpdate: "tool_call_update", toolCallId: "native-generation", name: "generate_image", status: "completed", rawInput } });
    return { stopReason: "end_turn" };
  } });
  f.job.remoteId = (await f.provider.submit({}, f.job)).remoteId;
  let result;
  do { await new Promise(resolve => setImmediate(resolve)); result = await f.provider.query({}, f.job); } while (result.status === "running");
  assert.equal(result.status, "succeeded", JSON.stringify(result));
  assert.equal(result.outputs[0].path, join(f.cwd, "cli-results/durable-image/image-1.png"));
  assert.deepEqual(await readFile(result.outputs[0].path), Buffer.from(png, "base64"));
  assert.equal(f.requests.filter(r => r.method === "session/prompt").length, 1);
});

test("provider cancellation closes native execution and persists cancelled without resubmission", async (t) => {
  let entered;
  const ready = new Promise(resolve => { entered = resolve; });
  const f = await providerFixture(t, { prompt: async ({ signal }) => { entered(); await new Promise(resolve => signal.addEventListener("abort", resolve, { once: true })); return { stopReason: "cancelled" }; } });
  f.job.remoteId = (await f.provider.submit({}, f.job)).remoteId;
  await ready;
  assert.equal((await f.provider.cancel({}, f.job)).status, "cancelled");
  assert.equal(f.killed.length, 1);
  assert.equal((await f.provider.submit({}, f.job)).status, "cancelled");
  assert.equal(f.requests.filter(r => r.method === "session/prompt").length, 1);
});

test("aborted Antigravity preflight is durably cancelled before any prompt", async (t) => {
  const f = await providerFixture(t);
  const controller = new AbortController();
  f.provider.check = async () => { controller.abort(); throw controller.signal.reason; };
  assert.equal((await f.provider.submit({}, f.job, { signal: controller.signal })).status, "cancelled");
  assert.equal(f.requests.length, 0);
  assert.equal((await f.provider.submit({}, f.job)).status, "cancelled");
});
