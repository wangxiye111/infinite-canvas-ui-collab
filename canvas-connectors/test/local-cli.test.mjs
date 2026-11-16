import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink } from "node:fs/promises";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { createLocalCliProviders } from "../src/providers/local-cli.mjs";

const threadId = "a0f5bf8e-1cb0-4b3e-bb6d-67125e131892";
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4AWP4DwQACfsD/c8LaHIAAAAASUVORK5CYII=", "base64");
const jobFor = (provider = "codex-cli", action = "text", params = {}) => ({
  id: "test-job", provider, preset: { provider, action, params }, prompt: "画一辆车", inputs: [],
});

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "canvas-local-cli-"));
  const bin = join(directory, ".local/bin");
  await mkdir(bin, { recursive: true });
  for (const name of ["codex", "gemini", "agy", "gpt-image-2-skill"])
    await writeFile(join(bin, name + (process.platform === "win32" ? ".exe" : "")), "test executable; never run", { mode: 0o700 });
  const input = join(directory, "reference.png");
  await writeFile(input, png);
  const calls = [];
  const probes = [];
  const probeResponses = { "--help": ["Codex CLI", 0, ""], "features list": ["image_generation stable true\n", 0, ""], "login status": ["", 0, "Logged in using ChatGPT private@example.com"] };
  const killed = [];
  const catalog = { models: [
    { id: "gpt-image-driver", isDefault: true, defaultReasoningEffort: "low", supportedReasoningEfforts: ["low", "high"] },
    { id: "gpt-custom", isDefault: false, defaultReasoningEffort: "high", supportedReasoningEfforts: ["high"] },
  ] };
  const catalogCalls = [];
  const ctx = {
    dataDir: directory,
    homeDir: directory,
    env: { PATH: "", CODEX_HOME: join(directory, ".codex"), CODEX_API_KEY: "test-not-an-actual-secret", OPENAI_API_KEY: "test-not-an-actual-secret" },
    queryCodexImageModels: async (options) => { catalogCalls.push(options); if (catalog.error) throw new Error(catalog.error); return catalog.models; },
    getFile: async () => ({ path: input, mimeType: "image/png", name: "private.png" }),
    spawn(executable, args, options) {
      const child = new EventEmitter();
      child.stdin = new PassThrough();
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      const call = { executable, args, options, child, stdin: "" };
      child.stdin.on("data", (chunk) => { call.stdin += chunk.toString(); });
      const command = args.slice(0, args.indexOf("-c") < 0 ? args.length : args.indexOf("-c")).join(" ");
      if (["codex", "codex.exe"].includes(basename(executable).toLowerCase()) && Object.hasOwn(probeResponses, command)) {
        probes.push(call);
        queueMicrotask(() => complete(call, ...probeResponses[command]));
      } else calls.push(call);
      return child;
    },
    killCliProcess(child) { killed.push(child); child.emit("close", null); },
  };
  const providers = Object.fromEntries(createLocalCliProviders(ctx).map((provider) => [provider.id, provider]));
  t.after(async () => {
    for (const provider of Object.values(providers)) await provider.close();
    await rm(directory, { recursive: true, force: true });
  });
  return { ctx, directory, bin, providers, calls, probes, probeResponses, killed, catalog, catalogCalls };
}

function complete(call, stdout = "", code = 0, stderr = "") {
  call.child.stdout.write(stdout);
  call.child.stderr.write(stderr);
  call.child.stdout.end();
  call.child.stderr.end();
  call.child.emit("close", code);
}

async function final(provider, job) {
  for (let i = 0; i < 200; i++) {
    const result = await provider.query({}, job);
    if (result.status !== "running") return result;
    await delay(5);
  }
  throw new Error("Test CLI did not finish");
}

test("Codex onboarding uses browser membership login and cancellation stops only its process", async (t) => {
  const x = await fixture(t);
  const controller = new AbortController();
  const urls = [];
  const login = x.providers['codex-cli'].login({}, value => urls.push(value.url), { signal: controller.signal });
  while (!x.calls.length) await delay(1);
  const call = x.calls[0];
  assert.equal(call.args[0], 'login');
  assert.equal(call.options.env.OPENAI_API_KEY, undefined);
  assert.equal(call.options.env.CODEX_API_KEY, undefined);
  call.child.stderr.write('Open https://auth.openai.com/oauth/authorize?state=fixture\n');
  assert.ok(urls.includes('https://auth.openai.com/oauth/authorize?state=fixture'));
  controller.abort(new Error('cancelled'));
  await assert.rejects(login, /cancelled/);
  assert.deepEqual(x.killed, [call.child]);
});

test("bundled CLI is discovered with Unicode and spaces without configuring an executable", async (t) => {
  const x = await fixture(t);
  const tools = join(x.directory, '新用户 安装', 'tools');
  await mkdir(tools, { recursive: true });
  const path = join(tools, process.platform === 'win32' ? 'agy.exe' : 'agy');
  await writeFile(path, 'fixture', { mode: 0o700 });
  x.ctx.env.CANVAS_BUNDLED_TOOLS = tools;
  const found = (await x.providers['antigravity-cli'].status({})).details.executable;
  assert.equal(process.platform === 'win32' ? found.toLowerCase() : found, process.platform === 'win32' ? path.toLowerCase() : path);
});

test("discovery distinguishes installed executables from authorization and image capability", async (t) => {
  const { providers, calls } = await fixture(t);
  for (const [id, provider] of Object.entries(providers)) {
    const status = await provider.status({});
    assert.equal(status.state, "configured");
    assert.equal(status.details.loginState, "unchecked");
    assert.equal(status.details.imageAvailable, false);
    assert.equal(typeof provider.login, id === "gemini-cli" ? "undefined" : "function");
    assert.deepEqual(provider.actions.map((action) => action.id), ["text", "image"]);
  }
  const missing = await providers["codex-cli"].status({ executable: "/missing/codex", imageExecutable: "/missing/helper" });
  assert.equal(missing.state, "not-installed");
  assert.equal(missing.details.imageAvailable, false);
  assert.equal(calls.length, 0);
});

test("connection check invokes only help and never echoes diagnostic account data", async (t) => {
  const { providers, calls } = await fixture(t);
  const pending = providers["gemini-cli"].check({});
  while (!calls.length) await delay(1);
  assert.deepEqual(calls[0].args, ["--help"]);
  complete(calls[0], "help token=private-value");
  const summary = await pending;
  assert.equal(summary.state, "configured");
  assert.equal(JSON.stringify(summary).includes("private-value"), false);
});

test("Codex text uses stdin, explicit sandbox, unchanged model and durable output", async (t) => {
  const { ctx, directory, providers, calls } = await fixture(t);
  const provider = providers["codex-cli"];
  const job = jobFor();
  job.prompt = "$(touch forbidden); `echo dangerous`";
  job.preset.model = "some-future-model";
  job.preset.params.messages = [{ role: "assistant", content: "上一条答复" }];
  job.inputs = [{ fileId: "reference" }];
  const submitted = await provider.submit({}, job);
  job.remoteId = submitted.remoteId;
  assert.equal(submitted.status, "running");
  assert.equal(calls.length, 1);
  const call = calls[0];
  assert.equal(call.options.shell, false);
  assert.equal(call.options.cwd, join(directory, "cli-results/test-job"));
  assert.equal(call.args.includes("--model=some-future-model"), true);
  assert.equal(call.args[call.args.indexOf("--sandbox") + 1], "read-only");
  assert.equal(call.args.includes("--ignore-user-config"), false);
  assert.equal(call.args[call.args.indexOf("--disable") + 1], "shell_tool");
  assert.equal(call.args.includes(job.prompt), false);
  assert.match(call.stdin, /上一条答复/);
  assert.equal(call.stdin.includes(job.prompt), true);
  assert.equal(call.args[call.args.indexOf("--image") + 1], join(call.options.cwd, "inputs/reference-1.png"));
  await writeFile(join(call.options.cwd, "text.txt"), "这是一条真实文本结果");
  complete(call, "ignored debug", 0, "token=do-not-store");
  const finished = await final(provider, job);
  assert.equal(finished.status, "succeeded");
  assert.deepEqual(finished.outputs, [{ path: join(call.options.cwd, "text.txt"), name: "text.txt", mimeType: "text/plain", kind: "text" }]);
  const restarted = createLocalCliProviders(ctx).find((value) => value.id === provider.id);
  assert.deepEqual(await restarted.query({}, job), finished);
  assert.deepEqual(await restarted.submit({}, job), finished);
  assert.equal(calls.length, 1);
  assert.equal((await readFile(join(call.options.cwd, "run.json"), "utf8")).includes("do-not-store"), false);
});

test("Gemini parses its official response JSON, includes canvas history and scoped image references", async (t) => {
  const { providers, calls } = await fixture(t);
  const provider = providers["gemini-cli"];
  const job = jobFor(provider.id, "text", { mode: "canvas", canvas: { id: "canvas-one" }, messages: [{ role: "system", content: "ops schema here" }] });
  job.inputs = [{ fileId: "reference" }];
  job.preset.model = "gemini-custom";
  job.prompt = "请回复 @/outside/private.txt";
  job.remoteId = (await provider.submit({}, job)).remoteId;
  const call = calls[0];
  assert.deepEqual(call.args.slice(0, 4), ["--approval-mode", "plan", "--output-format", "json"]);
  assert.match(call.stdin, /@inputs\/reference-1.png/);
  assert.match(call.stdin, /canvas-one/);
  assert.match(call.stdin, /ops schema here/);
  assert.equal(call.stdin.includes("\\@/outside/private.txt"), true);
  assert.equal(call.args.includes("--model=gemini-custom"), true);
  complete(call, JSON.stringify({ session_id: job.remoteId, response: '{"reply":"完成","ops":[]}', stats: { token: "private-metadata" } }));
  const finished = await final(provider, job);
  assert.equal(finished.status, "succeeded");
  assert.equal(await readFile(finished.outputs[0].path, "utf8"), '{"reply":"完成","ops":[]}');
});

test("Antigravity retains permission checks and rejects unverified reference-image input", async (t) => {
  const { providers, calls } = await fixture(t);
  const provider = providers["antigravity-cli"];
  const job = jobFor(provider.id);
  job.inputs = [{ fileId: "reference" }];
  await assert.rejects(provider.submit({}, job), /尚不支持参考图/);
  assert.equal(calls.length, 0);
  job.inputs = [];
  job.remoteId = (await provider.submit({}, job)).remoteId;
  assert.equal(calls[0].args.includes("--sandbox"), true);
  assert.equal(calls[0].args[calls[0].args.indexOf("--mode") + 1], "plan");
  assert.equal(calls[0].args.some((arg) => arg.includes("skip-permissions")), false);
  complete(calls[0], "来自 Antigravity 的答复");
  const finished = await final(provider, job);
  assert.equal(await readFile(finished.outputs[0].path, "utf8"), "来自 Antigravity 的答复");
});

test("unavailable image engines never launch another CLI or fallback API", async (t) => {
  const { providers, calls } = await fixture(t);
  for (const id of ["gemini-cli"])
    await assert.rejects(providers[id].submit({}, jobFor(id, "image")), /不会改走其他引擎或 API/);
  assert.equal(calls.length, 0);
});

test("Codex native image uses official sandboxed CLI and only its actual generated artifacts", async (t) => {
  const { directory, providers, calls } = await fixture(t);
  const provider = providers["codex-cli"];
  const job = jobFor(provider.id, "image", { count: 2, size: "1536x1024", quality: "high" });
  job.inputs = [{ fileId: "reference" }];
  job.preset.model = "gpt-custom";
  job.remoteId = (await provider.submit({}, job)).remoteId;
  const call = calls[0];
  assert.ok(["codex", "codex.exe"].includes(basename(call.executable).toLowerCase()));
  assert.equal(call.args[0], "exec");
  assert.equal(call.args[call.args.indexOf("--sandbox") + 1], "read-only");
  assert.equal(call.args[call.args.indexOf("--disable") + 1], "shell_tool");
  assert.equal(call.args.includes("--json"), true);
  assert.equal(call.args.includes("--ignore-user-config"), false);
  assert.equal(call.args.some((arg) => /bypass|yolo/.test(arg)), false);
  assert.equal(call.args.includes('model_provider="openai"'), true);
  assert.equal(call.args.includes('openai_base_url="https://chatgpt.com/backend-api/codex"'), true);
  assert.equal(call.args.includes('chatgpt_base_url="https://chatgpt.com/backend-api/"'), true);
  assert.equal(call.options.env.CODEX_API_KEY, undefined);
  assert.equal(call.options.env.OPENAI_API_KEY, undefined);
  assert.equal(call.args.includes("--model=gpt-custom"), true);
  assert.match(call.stdin, /1536x1024/);
  assert.match(call.stdin, /high/);
  assert.match(call.stdin, /2/);
  assert.equal(call.args.includes("--image"), true);
  const artifactDir = join(directory, ".codex/generated_images", threadId);
  await mkdir(artifactDir, { recursive: true });
  const paths = [join(artifactDir, "image-1.png"), join(artifactDir, "image-2.png")];
  for (const path of paths) await writeFile(path, png);
  complete(call, JSON.stringify({ type: "thread.started", thread_id: threadId }) + "\n" + JSON.stringify({ type: "turn.completed", usage: { private: "private-account" } }));
  const finished = await final(provider, job);
  assert.equal(finished.status, "succeeded");
  assert.equal(finished.outputs.length, 2);
  assert.equal(finished.outputs.every((output) => output.mimeType === "image/png" && output.kind === "image" && output.path.startsWith(call.options.cwd)), true);
  assert.equal((await readFile(join(call.options.cwd, "run.json"), "utf8")).includes("private-account"), false);
});

test("native image output validation rejects text, outside artifacts, symlinks and a missing thread", async (t) => {
  for (const scenario of ["text", "truncated-png", "outside", "symlink", "missing-thread"]) {
    await t.test(scenario, async (t) => {
      const { directory, providers, calls } = await fixture(t);
      const provider = providers["codex-cli"];
      const job = jobFor(provider.id, "image");
      job.remoteId = (await provider.submit({}, job)).remoteId;
      const artifactDir = join(directory, ".codex/generated_images", threadId);
      await mkdir(artifactDir, { recursive: true });
      let path = join(artifactDir, "image.png");
      if (scenario === "outside") path = join(directory, "outside.png");
      if (scenario === "symlink") {
        try { await symlink(join(directory, "reference.png"), path); }
        catch (error) {
          if (process.platform !== "win32" || error.code !== "EPERM") throw error;
          t.skip("当前 Windows 用户无创建文件符号链接权限");
          return;
        }
      }
      else await writeFile(path, scenario === "text" ? "not an image" : scenario === "truncated-png" ? png.subarray(0, 33) : png);
      complete(calls[0], JSON.stringify(scenario === "missing-thread" ? { type: "item.completed", item: { text: path } } : { type: "thread.started", thread_id: threadId }) + "\n" + JSON.stringify({ type: "turn.completed" }));
      assert.equal((await final(provider, job)).status, "failed");
      assert.equal(calls.length, 1);
    });
  }
});

test("failed model invocation is durable without fallback, retries or diagnostic leakage", async (t) => {
  const { providers, calls } = await fixture(t);
  const provider = providers["gemini-cli"];
  const job = jobFor(provider.id);
  job.preset.model = "unknown-model";
  job.remoteId = (await provider.submit({}, job)).remoteId;
  complete(calls[0], "access_token=private-token", 1, "password=private-password");
  const finished = await final(provider, job);
  assert.equal(finished.status, "failed");
  assert.equal(JSON.stringify(finished).includes("private-"), false);
  assert.equal((await provider.submit({}, job)).remoteId, job.remoteId);
  assert.equal(calls.length, 1);
});

test("cancellation stops only the owned process and ignores a later result", async (t) => {
  const { providers, calls, killed } = await fixture(t);
  const provider = providers["gemini-cli"];
  const job = jobFor(provider.id);
  job.remoteId = (await provider.submit({}, job)).remoteId;
  const cancelled = await provider.cancel({}, job);
  assert.equal(cancelled.status, "cancelled");
  assert.match(cancelled.message, /不代表退还额度/);
  assert.deepEqual(killed, [calls[0].child]);
  complete(calls[0], JSON.stringify({ response: "late text" }));
  assert.equal((await final(provider, job)).status, "cancelled");
  await provider.submit({}, job);
  assert.equal(calls.length, 1);
});

test("service close persists cancellation for owned executions", async (t) => {
  const { ctx, providers, calls, killed } = await fixture(t);
  const provider = providers["gemini-cli"];
  const job = jobFor(provider.id);
  job.remoteId = (await provider.submit({}, job)).remoteId;
  await provider.close();
  assert.equal(killed.length, 1);
  const restarted = createLocalCliProviders(ctx).find((item) => item.id === provider.id);
  assert.equal((await restarted.query({}, job)).status, "cancelled");
  assert.equal(calls.length, 1);
});

test("cancellation does not claim success before the owned CLI actually exits", async (t) => {
  const { ctx, providers, calls } = await fixture(t);
  const provider = providers["gemini-cli"];
  const job = jobFor(provider.id);
  job.remoteId = (await provider.submit({}, job)).remoteId;
  ctx.killCliProcess = () => {};
  let resolved = false;
  const cancellation = provider.cancel({}, job).then((value) => { resolved = true; return value; });
  await delay(5);
  assert.equal(resolved, false);
  assert.equal((await provider.query({}, job)).status, "running");
  complete(calls[0], "", null);
  assert.equal((await cancellation).status, "cancelled");
});

test("restart marks an unowned pending execution interrupted and never restarts it", async (t) => {
  const { directory, providers, calls } = await fixture(t);
  const job = jobFor("gemini-cli");
  job.remoteId = "previous-run";
  const runDir = join(directory, "cli-results", job.id);
  await mkdir(runDir, { recursive: true });
  await writeFile(join(runDir, "run.json"), JSON.stringify({ version: 1, jobId: job.id, provider: job.provider, remoteId: job.remoteId, status: "running" }));
  assert.equal((await providers[job.provider].query({}, job)).status, "interrupted");
  assert.equal((await providers[job.provider].submit({}, job)).status, "interrupted");
  assert.equal(calls.length, 0);
});

test("durable run ID recovers both live and finished jobs before the main job saves remoteId", async (t) => {
  const { ctx, providers, calls } = await fixture(t);
  const provider = providers["gemini-cli"];
  const job = jobFor(provider.id);
  const submitted = await provider.submit({}, job);
  assert.equal(job.remoteId, undefined);
  assert.equal(provider.queryWithoutRemoteId, true);
  assert.deepEqual(await provider.query({}, job), submitted);
  complete(calls[0], JSON.stringify({ response: "recovered result" }));
  const finished = await final(provider, job);
  assert.equal(finished.remoteId, submitted.remoteId);
  assert.equal(finished.status, "succeeded");
  const restarted = createLocalCliProviders(ctx).find((item) => item.id === provider.id);
  assert.deepEqual(await restarted.query({}, job), finished);
  assert.equal(calls.length, 1);
});

test("corrupt or foreign run records are retained and path traversal is rejected", async (t) => {
  const { directory, providers, calls } = await fixture(t);
  const provider = providers["codex-cli"];
  const job = jobFor();
  const runDir = join(directory, "cli-results", job.id);
  await mkdir(runDir, { recursive: true });
  const path = join(runDir, "run.json");
  await writeFile(path, "{corrupt");
  await assert.rejects(provider.submit({}, job), /保留原文件/);
  assert.equal(await readFile(path, "utf8"), "{corrupt");
  await writeFile(path, JSON.stringify({ version: 1, jobId: job.id, provider: "other", remoteId: "run" }));
  await assert.rejects(provider.submit({}, job), /记录不匹配/);
  await assert.rejects(provider.submit({}, { ...job, id: "../escape" }), /无效的本地任务 ID/);
  assert.equal(calls.length, 0);
});


test("native Codex check reads feature and login status without model requests or credential disclosure", async (t) => {
  const { providers, probes, calls } = await fixture(t);
  const summary = await providers["codex-cli"].check({});
  assert.deepEqual(probes.map((call) => call.args.slice(0, call.args.indexOf("-c")).join(" ")), ["--help", "features list", "login status"]);
  assert.equal(calls.length, 0);
  assert.equal(summary.state, "ready");
  assert.equal(summary.details.imageAdapter, "codex-native");
  assert.equal(summary.details.imageAvailable, true);
  assert.equal(summary.details.loginState, "authenticated");
  assert.equal(summary.details.authMethod, "chatgpt");
  assert.equal(summary.details.quota, "unknown");
  assert.equal(JSON.stringify(summary).includes("private@example.com"), false);
});

test("native Codex missing login, API-key auth and missing image capability never generate", async (t) => {
  for (const scenario of ["not-logged-in", "api-key", "no-native-tool"]) await t.test(scenario, async (t) => {
    const { providers, calls, probeResponses } = await fixture(t);
    if (scenario === "not-logged-in") probeResponses["login status"] = ["", 1, "Not logged in"];
    if (scenario === "api-key") probeResponses["login status"] = ["", 0, "Logged in using an API key - sk-private-never-expose"];
    if (scenario === "no-native-tool") probeResponses["features list"] = ["other stable true", 0, ""];
    const status = await providers["codex-cli"].check({});
    assert.equal(status.details.imageAvailable, false);
    assert.equal(JSON.stringify(status).includes("sk-private"), false);
    await assert.rejects(providers["codex-cli"].submit({}, jobFor("codex-cli", "image")), /登录|原生图片能力/);
    assert.equal(calls.length, 0);
  });
});

test("native Codex rejects more than five references before generation without dropping inputs", async (t) => {
  const { providers, calls } = await fixture(t);
  const job = jobFor("codex-cli", "image");
  job.inputs = Array.from({ length: 6 }, () => ({ fileId: "reference" }));
  await assert.rejects(providers["codex-cli"].submit({}, job), /最多接收 5 张参考图/);
  assert.equal(calls.length, 0);
});

test("native Codex does not accept artifacts without an official completed turn", async (t) => {
  const { providers, calls, directory } = await fixture(t);
  const job = jobFor("codex-cli", "image");
  job.remoteId = (await providers["codex-cli"].submit({}, job)).remoteId;
  const artifactDir = join(directory, ".codex/generated_images", threadId);
  await mkdir(artifactDir, { recursive: true });
  await writeFile(join(artifactDir, "image.png"), png);
  complete(calls[0], JSON.stringify({ type: "thread.started", thread_id: threadId }));
  assert.equal((await final(providers["codex-cli"], job)).status, "failed");
});

test("native thread identity is saved while generation is running for honest crash recovery", async (t) => {
  const { providers, calls } = await fixture(t);
  const job = jobFor("codex-cli", "image");
  job.remoteId = (await providers["codex-cli"].submit({}, job)).remoteId;
  const call = calls[0];
  call.child.stdout.write("null\nmalformed-json\n");
  const event = JSON.stringify({ type: "thread.started", thread_id: threadId }) + "\n";
  call.child.stdout.write(event.slice(0, 14));
  call.child.stdout.write(event.slice(14));
  await delay(20);
  const record = JSON.parse(await readFile(join(call.options.cwd, "run.json"), "utf8"));
  assert.equal(record.nativeThreadId, threadId);
  assert.equal(record.status, "running");
});


test("native cancellation waits for thread identity persistence before its final record", async (t) => {
  const { ctx, providers, calls } = await fixture(t);
  const job = jobFor("codex-cli", "image");
  job.remoteId = (await providers["codex-cli"].submit({}, job)).remoteId;
  calls[0].child.stdout.write(JSON.stringify({ type: "thread.started", thread_id: threadId }) + "\n");
  assert.equal((await providers["codex-cli"].cancel({}, job)).status, "cancelled");
  await delay(10);
  const saved = JSON.parse(await readFile(join(calls[0].options.cwd, "run.json"), "utf8"));
  assert.equal(saved.status, "cancelled");
  assert.equal(saved.nativeThreadId, threadId);
  const restarted = createLocalCliProviders(ctx).find((provider) => provider.id === "codex-cli");
  assert.equal((await restarted.query({}, job)).status, "cancelled");
});


test("native image failure saves only a safe category and never resubmits", async (t) => {
  const { providers, calls } = await fixture(t);
  const job = jobFor("codex-cli", "image");
  job.remoteId = (await providers["codex-cli"].submit({}, job)).remoteId;
  complete(calls[0], JSON.stringify({ type: "turn.failed", error: { message: "The model is not supported: sk-private-value" } }), 1, "Bearer private-token");
  const finished = await final(providers["codex-cli"], job);
  assert.equal(finished.status, "failed");
  assert.match(finished.message, /model-unavailable/);
  const saved = await readFile(join(calls[0].options.cwd, "run.json"), "utf8");
  assert.equal(saved.includes("private"), false);
  assert.equal(JSON.parse(saved).failureCode, "model-unavailable");
  await providers["codex-cli"].submit({}, job);
  assert.equal(calls.length, 1);
});


test("image default explicitly selects an official catalog driver and reasoning, never the global model", async (t) => {
  const { providers, calls, catalogCalls } = await fixture(t);
  const job = jobFor("codex-cli", "image");
  await providers["codex-cli"].submit({}, job);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].args.includes("--model=gpt-image-driver"), true);
  assert.equal(calls[0].args.includes('model_reasoning_effort="low"'), true);
  assert.equal(catalogCalls.length, 1);
  assert.equal(catalogCalls[0].env.CODEX_API_KEY, undefined);
  assert.equal(catalogCalls[0].env.OPENAI_API_KEY, undefined);
  assert.equal(catalogCalls[0].configArgs.includes('model_provider="openai"'), true);
  const record = JSON.parse(await readFile(join(calls[0].options.cwd, "run.json"), "utf8"));
  assert.equal(record.imageDriverModel, "gpt-image-driver");
  assert.equal(record.imageDriverReasoning, "low");
});

test("explicit image driver is kept only if listed, with its supported default reasoning", async (t) => {
  const { providers, calls } = await fixture(t);
  const job = jobFor("codex-cli", "image");
  job.preset.model = "gpt-custom";
  await providers["codex-cli"].submit({}, job);
  assert.equal(calls[0].args.includes("--model=gpt-custom"), true);
  assert.equal(calls[0].args.includes('model_reasoning_effort="high"'), true);
});

test("unavailable explicit image driver fails before inference instead of switching models", async (t) => {
  const { providers, calls } = await fixture(t);
  const job = jobFor("codex-cli", "image");
  job.preset.model = "gpt-unavailable-global";
  await assert.rejects(providers["codex-cli"].submit({}, job), /所选图片驱动未在官方模型目录/);
  assert.equal(calls.length, 0);
});

test("missing, ambiguous or invalid official image driver never reports ready or falls back", async (t) => {
  for (const scenario of ["empty", "ambiguous", "unsupported-reasoning", "error"]) await t.test(scenario, async (t) => {
    const { providers, calls, catalog } = await fixture(t);
    if (scenario === "empty") catalog.models = [];
    if (scenario === "ambiguous") catalog.models[1].isDefault = true;
    if (scenario === "unsupported-reasoning") catalog.models[0].defaultReasoningEffort = "not-supported";
    if (scenario === "error") catalog.error = "private-token user@example.test";
    const status = await providers["codex-cli"].check({});
    assert.equal(status.details.imageAvailable, false);
    assert.equal(status.details.imageDriverState, "unavailable");
    assert.equal(status.state, "configured");
    assert.equal(JSON.stringify(status).includes("private-token"), false);
    await assert.rejects(providers["codex-cli"].submit({}, jobFor("codex-cli", "image")), /官方(?: Codex )?模型目录/);
    assert.equal(calls.length, 0);
  });
});

test("image submission rechecks the catalog while text leaves model and reasoning untouched", async (t) => {
  const { providers, calls, catalog, catalogCalls } = await fixture(t);
  const first = await providers["codex-cli"].check({});
  assert.equal(first.details.imageDriverModel, "gpt-image-driver");
  catalog.models[0].id = "gpt-new-default";
  await providers["codex-cli"].submit({}, jobFor("codex-cli", "image"));
  assert.equal(calls[0].args.includes("--model=gpt-new-default"), true);
  const textJob = jobFor("codex-cli", "text"); textJob.id = "text-job";
  const before = catalogCalls.length;
  await providers["codex-cli"].submit({}, textJob);
  assert.equal(catalogCalls.length, before);
  assert.equal(calls[1].args.some((arg) => arg.startsWith("--model=") || arg.startsWith("model_reasoning_effort=")), false);
});

test("cancelled image preflight never launches generation and saves a durable cancelled record", async (t) => {
  const { ctx, directory, providers, calls, catalog } = await fixture(t);
  let seenSignal, release, started;
  const began = new Promise((resolve) => { started = resolve; });
  ctx.queryCodexImageModels = (options) => new Promise((resolve, reject) => {
    seenSignal = options.signal; release = () => resolve(catalog.models);
    options.signal.addEventListener("abort", () => reject(new Error("cancelled")), { once: true });
    started();
  });
  const controller = new AbortController();
  const job = jobFor("codex-cli", "image");
  const pending = providers["codex-cli"].submit({}, job, { signal: controller.signal });
  await began;
  controller.abort();
  try { assert.equal(seenSignal.aborted, true); } finally { release(); }
  const finished = await pending;
  assert.equal(finished.status, "cancelled");
  assert.equal(calls.length, 0);
  const saved = JSON.parse(await readFile(join(directory, "cli-results/test-job/run.json"), "utf8"));
  assert.equal(saved.status, "cancelled");
  assert.equal((await providers["codex-cli"].submit({}, job)).status, "cancelled");
});

test("pre-aborted image submission skips all checks and generation", async (t) => {
  const { providers, calls, probes, catalogCalls } = await fixture(t);
  const controller = new AbortController(); controller.abort();
  const value = await providers["codex-cli"].submit({}, jobFor("codex-cli", "image"), { signal: controller.signal });
  assert.equal(value.status, "cancelled");
  assert.equal(calls.length + probes.length + catalogCalls.length, 0);
});

test("cancellation while reference inputs are copied still prevents the image exec", async (t) => {
  const { ctx, directory, providers, calls } = await fixture(t);
  let release, started;
  const began = new Promise((resolve) => { started = resolve; });
  ctx.getFile = () => new Promise((resolve) => { release = () => resolve({path: join(directory, "reference.png"), mimeType: "image/png"}); started(); });
  const controller = new AbortController();
  const job = jobFor("codex-cli", "image"); job.inputs = [{ fileId: "reference" }];
  const pending = providers["codex-cli"].submit({}, job, { signal: controller.signal });
  await began; controller.abort(); release();
  assert.equal((await pending).status, "cancelled");
  assert.equal(calls.length, 0);
});


test('catalog diagnostic is retained safely without revoking authenticated account status', async (t) => {
  const { ctx, providers, calls } = await fixture(t);
  ctx.queryCodexImageModels = async () => { throw Object.assign(new Error('ENOTFOUND private-account sk-private'), { code: 'network' }); };
  const result = await providers['codex-cli'].check({});
  assert.equal(result.details.loginState, 'authenticated');
  assert.equal(result.details.imageDriverError, 'network');
  assert.equal(result.details.imageAvailable, false);
  assert.match(result.details.imageMessage, /网络/);
  assert.doesNotMatch(JSON.stringify(result), /private-account|sk-private/);
  assert.equal(calls.length, 0);
});
