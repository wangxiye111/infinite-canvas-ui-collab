import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import createProviders from "../src/providers/index.mjs";
import { signedUrl } from "../src/providers/liblib.mjs";

const response = (value) =>
  new Response(JSON.stringify(value), {
    headers: { "Content-Type": "application/json" },
  });
const job = (provider, action, params = {}) => ({
  id: "local-job",
  provider,
  preset: { provider, action, params },
  prompt: "一辆车",
  inputs: [],
});
async function fixture(t, overrides = {}) {
  const directory = await mkdtemp(join(tmpdir(), "canvas-providers-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(
    join(directory, "image.png"),
    new Uint8Array([137, 80, 78, 71]),
  );
  const ctx = {
    dataDir: directory,
    which: async () => null,
    fetch: async () => {
      throw new Error("Unexpected network");
    },
    runCli: async () => {
      throw new Error("Unexpected command");
    },
    getFile: async (id) => {
      assert.equal(id, "input-file");
      return {
        id,
        path: join(directory, "image.png"),
        name: "image.png",
        mimeType: "image/png",
      };
    },
    ...overrides,
  };
  return {
    ctx,
    providers: Object.fromEntries(
      createProviders(ctx).map((provider) => [provider.id, provider]),
    ),
    directory,
  };
}

test("platform and local CLI providers expose distinct contracts without automatic network or login", async (t) => {
  const { providers } = await fixture(t);
  assert.deepEqual(Object.keys(providers), [
    "kling",
    "jimeng",
    "runninghub",
    "tripo",
    "liblib",
    "codex-cli",
    "gemini-cli",
    "antigravity-cli",
  ]);
  assert.equal((await providers.kling.status({})).state, "not-installed");
  assert.equal((await providers.jimeng.status({})).state, "not-installed");
  for (const id of ["runninghub", "tripo", "liblib"])
    assert.equal((await providers[id].status({})).state, "not-connected");
  assert.equal(
    (await providers.tripo.status({ apiKey: "saved" })).state,
    "configured",
  );
  assert.equal(
    (await providers.liblib.check({ accessKey: "saved", secretKey: "saved" }))
      .state,
    "configured",
  );
  assert.equal(providers.kling.cancel, undefined);
  assert.equal(providers.jimeng.cancel, undefined);
  assert.equal(providers.liblib.cancel, undefined);
  assert.equal(providers.tripo.cancel, undefined);
});

test("Tripo CN v3 account and text submit preserve genuine task id and output GLB", async (t) => {
  const calls = [];
  const { providers } = await fixture(t, {
    fetch: async (url, init) => {
      calls.push({ url, init });
      if (url.endsWith("/account/balance"))
        return response({
          code: 0,
          data: { balance: 12, frozen: 3, api_key: "do-not-echo" },
        });
      if (url.endsWith("/generation/text-to-model"))
        return response({ code: 0, data: { task_id: "remote-3d" } });
      return response({
        code: 0,
        data: {
          status: "success",
          progress: 100,
          output: { model_url: "https://cdn.tripo3d.com/model.glb" },
        },
      });
    },
  });
  const config = { apiKey: "test-secret" };
  assert.deepEqual((await providers.tripo.check(config)).details, {
    balance: 12,
    frozen: 3,
  });
  const task = job("tripo", "text-to-model", {
    options: { texture: true, pbr: false },
  });
  task.preset.model = "v3.1-20260211";
  const submitted = await providers.tripo.submit(config, task);
  assert.equal(submitted.remoteId, "remote-3d");
  assert.equal(
    calls[1].url,
    "https://openapi.tripo3d.com/v3/generation/text-to-model",
  );
  assert.equal(calls[1].init.headers.Authorization, "Bearer test-secret");
  assert.deepEqual(JSON.parse(calls[1].init.body), {
    texture: true,
    pbr: false,
    model: "v3.1-20260211",
    prompt: "一辆车",
  });
  const result = await providers.tripo.query(config, {
    ...task,
    remoteId: submitted.remoteId,
  });
  assert.equal(result.status, "succeeded");
  assert.equal(result.outputs[0].kind, "model3d");
  assert.equal(result.outputs[0].name, "tripo-model.glb");
});

test("Tripo image input uploads bytes and passes file_token via v3 input field", async (t) => {
  const calls = [];
  const { providers } = await fixture(t, {
    fetch: async (url, init) => {
      calls.push({ url, init });
      return response({
        code: 0,
        data: url.endsWith("/files")
          ? { file_token: "file_live_token" }
          : { task_id: "image-task" },
      });
    },
  });
  const task = job("tripo", "image-to-model");
  task.preset.model = "v3.1-20260211";
  task.inputs = [{ fileId: "input-file", role: "image" }];
  await providers.tripo.submit({ apiKey: "key" }, task);
  assert.equal(calls[0].url, "https://openapi.tripo3d.com/v3/files");
  assert.equal(calls[0].init.body.get("file").name, "image.png");
  assert.deepEqual(JSON.parse(calls[1].init.body), {
    model: "v3.1-20260211",
    input: "file_live_token",
  });
});

test("RunningHub workflow binds prompt and uploaded fileName; v2 query and workflow-only cancel", async (t) => {
  const calls = [];
  const { providers } = await fixture(t, {
    fetch: async (url, init) => {
      calls.push({ url, init });
      if (url.endsWith("/binary"))
        return response({
          code: 0,
          data: {
            fileName: "openapi/input.png",
            download_url: "https://preview/unused",
          },
        });
      if (url.endsWith("/create"))
        return response({
          code: 0,
          data: { taskId: "rh-real-id", taskStatus: "QUEUED" },
        });
      if (url.endsWith("/query"))
        return response({
          status: "SUCCESS",
          results: [
            {
              url: "https://cdn.runninghub.cn/output.mp4",
              outputType: "video",
            },
          ],
        });
      return response({ code: 0 });
    },
  });
  const task = job("runninghub", "workflow", {
    nodeInfoList: [{ nodeId: "6", fieldName: "seed", fieldValue: 123 }],
    promptTarget: { nodeId: "6", fieldName: "text" },
    inputTargets: [{ role: "image", nodeId: "10", fieldName: "image" }],
  });
  task.preset.remoteId = "workflow-remote";
  task.inputs = [{ fileId: "input-file", role: "image" }];
  const config = {
    apiKey: "secret",
    accessPassword: "private-workflow-password",
  };
  const submitted = await providers.runninghub.submit(config, task);
  assert.equal(submitted.remoteId, "rh-real-id");
  assert.equal(
    calls[0].url,
    "https://www.runninghub.cn/openapi/v2/media/upload/binary",
  );
  assert.deepEqual(JSON.parse(calls[1].init.body), {
    apiKey: "secret",
    workflowId: "workflow-remote",
    accessPassword: "private-workflow-password",
    nodeInfoList: [
      { nodeId: "6", fieldName: "seed", fieldValue: 123 },
      { nodeId: "6", fieldName: "text", fieldValue: "一辆车" },
      { nodeId: "10", fieldName: "image", fieldValue: "openapi/input.png" },
    ],
  });
  const remoteTask = { ...task, remoteId: submitted.remoteId };
  assert.equal(
    (await providers.runninghub.query(config, remoteTask)).outputs[0].kind,
    "video",
  );
  assert.equal(calls[2].url, "https://www.runninghub.cn/openapi/v2/query");
  assert.deepEqual(JSON.parse(calls[2].init.body), { taskId: "rh-real-id" });
  const cancellation = await providers.runninghub.cancel(config, remoteTask);
  assert.notEqual(cancellation.status, "cancelled");
  assert.equal(calls[3].url, "https://www.runninghub.cn/task/openapi/cancel");
  await assert.rejects(
    providers.runninghub.cancel(config, {
      ...remoteTask,
      preset: { action: "app" },
    }),
    /仅 ComfyUI/,
  );
});

test("RunningHub AI application route uses webappId and refuses unmapped inputs", async (t) => {
  let calls = 0;
  const { providers } = await fixture(t, {
    fetch: async (url, init) => {
      calls++;
      assert.equal(url, "https://www.runninghub.cn/task/openapi/ai-app/run");
      assert.deepEqual(JSON.parse(init.body), {
        apiKey: "key",
        webappId: "app-id",
        nodeInfoList: [],
      });
      return response({ code: 0, data: { taskId: "app-task" } });
    },
  });
  const task = job("runninghub", "app");
  task.preset.remoteId = "app-id";
  task.prompt = "";
  assert.equal(
    (await providers.runninghub.submit({ apiKey: "key" }, task)).remoteId,
    "app-task",
  );
  task.inputs = [{ fileId: "input-file" }];
  await assert.rejects(
    providers.runninghub.submit({ apiKey: "key" }, task),
    /尚未配置/,
  );
  assert.equal(calls, 1);
});

test("Liblib signing uses path + milliseconds + nonce HMAC-SHA1 base64url", () => {
  const url = new URL(
    signedUrl(
      { accessKey: "ak", secretKey: "sk" },
      "/api/generate/comfyui/app",
      "1234",
      "nonce",
    ),
  );
  assert.equal(url.origin, "https://openapi.liblibai.cloud");
  assert.equal(
    url.searchParams.get("Signature"),
    createHmac("sha1", "sk")
      .update("/api/generate/comfyui/app&1234&nonce")
      .digest("base64url"),
  );
  assert.equal(url.searchParams.get("AccessKey"), "ak");
  assert.equal(url.searchParams.get("Timestamp"), "1234");
});

test("Liblib uploads with signed form and maps generateParams without RunningHub envelope", async (t) => {
  const calls = [];
  const { providers } = await fixture(t, {
    fetch: async (url, init) => {
      calls.push({ url: String(url), init });
      if (String(url).includes("/upload/signature")) {
        assert.deepEqual(JSON.parse(init.body), {
          name: "image.png",
          extension: "png",
        });
        return response({
          code: 0,
          data: {
            postUrl: "https://liblib-input.oss-cn-beijing.aliyuncs.com/",
            key: "images/upload.png",
            policy: "policy",
            xOssDate: "date",
            xOssExpires: 60,
            xOssSignature: "signature",
            xOssCredential: "credential",
            xOssSignatureVersion: "OSS4-HMAC-SHA256",
          },
        });
      }
      if (String(url).startsWith("https://liblib-input."))
        return new Response(null, { status: 204 });
      if (String(url).includes("/comfyui/app"))
        return response({ code: 0, data: { generateUuid: "liblib-real-id" } });
      return response({
        code: 0,
        data: {
          generateStatus: 5,
          percentCompleted: 1,
          images: [
            { auditStatus: 3, imageUrl: "https://cdn.liblib.cloud/output.png" },
            {
              auditStatus: 4,
              imageUrl: "https://cdn.liblib.cloud/blocked.png",
            },
          ],
          videos: [
            { auditStatus: 3, videoUrl: "https://cdn.liblib.cloud/output.mp4" },
          ],
        },
      });
    },
  });
  const task = job("liblib", "workflow", {
    generateParams: {
      6: { inputs: { text: "" } },
      10: { inputs: { image: "" } },
    },
    promptPath: ["6", "inputs", "text"],
    inputTargets: [{ role: "image", path: ["10", "inputs", "image"] }],
  });
  task.preset.remoteId = "template-id";
  task.inputs = [{ role: "image", fileId: "input-file" }];
  const config = { accessKey: "ak", secretKey: "sk" };
  const submitted = await providers.liblib.submit(config, task);
  assert.equal(submitted.remoteId, "liblib-real-id");
  assert.equal(calls[1].init.body.get("x-oss-signature"), "signature");
  assert.equal(calls[1].init.headers, undefined);
  assert.deepEqual(JSON.parse(calls[2].init.body), {
    templateUuid: "template-id",
    generateParams: {
      6: { inputs: { text: "一辆车" } },
      10: {
        inputs: {
          image:
            "https://liblib-input.oss-cn-beijing.aliyuncs.com/images/upload.png",
        },
      },
    },
  });
  const result = await providers.liblib.query(config, {
    ...task,
    remoteId: submitted.remoteId,
  });
  assert.equal(result.outputs.length, 2);
  assert.equal(result.progress, 100);
  assert.equal(new URL(calls[3].url).pathname, "/api/generate/comfy/status");
});

// Envelope and argv semantics verified against installed @klingai/cli-cn v0.2.3.
// Body fields below follow the official reference; no account response was fetched.
test("Kling verifies CN npm package and uses official JSON CLI envelope and task outputs", async (t) => {
  const calls = [];
  let queryStatus = "COMPLETED";
  const { providers, ctx, directory } = await fixture(t, {
    runCli: async (name, args) => {
      calls.push({ name, args });
      if (args[0] === "who_am_i")
        return {
          code: 0,
          stdout: JSON.stringify({
            ok: true,
            body: {
              user: { userId: 1 },
              availableModels: {
                text_to_image: { defaultModel: "cn-model", models: [{ model: "cn-model", arguments: [{ name: "aspect_ratio", allowedValues: ["1:1"] }], inputs: [] }] },
              },
            },
          }),
          stderr: "",
        };
      if (args[0] === "account")
        return {
          code: 0,
          stdout: JSON.stringify({
            ok: true,
            body: { availableRemainCredits: 12, token: "never-echo" },
          }),
          stderr: "",
        };
      if (args[0] === "query_tasks")
        return {
          code: 0,
          stdout: JSON.stringify({
            ok: true,
            body: {
              status: queryStatus,
              works: [
                {
                  contentType: "image",
                  url: "https://cdn.klingai.com/output.png",
                },
              ],
            },
          }),
          stderr: "",
        };
      return {
        code: 0,
        stdout: JSON.stringify({
          ok: true,
          body: { generationId: "generation-real-id" },
        }),
        stderr: "",
      };
    },
  });
  await mkdir(join(directory, "package/bin"), { recursive: true });
  await writeFile(
    join(directory, "package/package.json"),
    JSON.stringify({ name: "@klingai/cli-cn" }),
  );
  await writeFile(join(directory, "package/bin/kling"), "");
  ctx.which = async () => join(directory, "package/bin/kling");
  const checked = await providers.kling.check({});
  assert.equal(checked.state, "ready");
  assert.equal(checked.details.models.text_to_image[0].model, "cn-model");
  assert.equal(checked.details.models.text_to_image[0].arguments[0].name, "aspect_ratio");
  assert.ok(!JSON.stringify(checked).includes("never-echo"));
  const task = job("kling", "text_to_image", {
    options: { aspect_ratio: "1:1" },
  });
  task.preset.model = "cn-model";
  task.prompt = "--help $(touch /tmp/not-executed)";
  const submitted = await providers.kling.submit({}, task);
  assert.equal(submitted.remoteId, "generation-real-id");
  assert.deepEqual(calls[3], {
    name: "kling",
    args: [
      "text_to_image",
      "--model=cn-model",
      "--prompt=--help $(touch /tmp/not-executed)",
      "--aspect_ratio=1:1",
      "--poll=0",
    ],
  });
  assert.equal(
    (await providers.kling.query({}, { ...task, remoteId: submitted.remoteId }))
      .status,
    "succeeded",
  );
  for (const [upstream, expected] of [
    ["pending", "queued"],
    ["queueing", "queued"],
    ["success", "succeeded"],
    ["succeeded", "succeeded"],
  ]) {
    queryStatus = upstream;
    assert.equal(
      (
        await providers.kling.query(
          {},
          { ...task, remoteId: submitted.remoteId },
        )
      ).status,
      expected,
    );
  }
  await writeFile(
    join(directory, "package/package.json"),
    JSON.stringify({ name: "@klingai/cli-global" }),
  );
  await assert.rejects(providers.kling.submit({}, task), /全球可灵/);
  assert.equal(calls.length, 9);
});

test("Kling preserves the image format when passing extensionless stored references to the official CLI", async (t) => {
  const calls = [];
  let rejected = false;
  const { providers, ctx, directory } = await fixture(t, { runCli: async (_name, args) => {
    calls.push(args);
    for (const arg of args.filter(arg => arg.startsWith("--input="))) {
      const path = arg.split("=").slice(2).join("=");
      assert.match(path, /\.png$/);
      assert.deepEqual(await readFile(path), Buffer.from([137, 80, 78, 71]));
    }
    if (rejected && args[0] === "image_to_video") return { code: 1, stdout: "", stderr: 'Failed to upload first_image.png: {"error":{"type":"AGENT.UnsupportedFileType"}}' };
    const data = args[0] === "who_am_i" ? { availableModels: {
      image_to_video: { models: [{ model: "video", inputs: [{ name: "first_image", required: true }, { name: "tail_image" }], arguments: [] }] },
      image_to_image: { models: [{ model: "image", inputs: [{ name: "image_1", required: true }, { name: "image_2" }], arguments: [] }] },
    } } : { generationId: "real-id" };
    return { code: 0, stdout: JSON.stringify({ ok: true, body: data }), stderr: "" };
  } });
  await mkdir(join(directory, "package/bin"), { recursive: true });
  await writeFile(join(directory, "package/package.json"), JSON.stringify({ name: "@klingai/cli-cn" }));
  await writeFile(join(directory, "package/bin/kling"), "");
  const original = await ctx.getFile("input-file");
  const storedPath = join(directory, "extensionless-file");
  await writeFile(storedPath, await readFile(original.path));
  ctx.getFile = async () => ({ ...original, path: storedPath });
  ctx.which = async () => join(directory, "package/bin/kling");
  const video = job("kling", "image_to_video");
  video.preset.model = "video";
  video.inputs = [{ fileId: "input-file", role: "image" }, { fileId: "input-file", role: "tailImage" }];
  await providers.kling.submit({}, video);
  assert.ok(calls[1].some(arg => arg.startsWith("--input=first_image=")));
  assert.ok(calls[1].some(arg => arg.startsWith("--input=tail_image=")));
  for (const arg of calls[1].filter(arg => arg.startsWith("--input="))) {
    await assert.rejects(readFile(arg.split("=").slice(2).join("=")), { code: "ENOENT" });
  }
  const image = job("kling", "image_to_image");
  image.preset.model = "image";
  image.inputs = video.inputs.map(input => ({ ...input, role: "image" }));
  await providers.kling.submit({}, image);
  assert.ok(calls[3].some(arg => arg.startsWith("--input=image_1=")));
  assert.ok(calls[3].some(arg => arg.startsWith("--input=image_2=")));
  rejected = true;
  await assert.rejects(providers.kling.submit({}, video), { code: "KLING_INPUT_REJECTED" });
  video.inputs = [];
  await assert.rejects(providers.kling.submit({}, video), /缺少必需/);
  assert.equal(calls.filter(args => args[0] === "image_to_video").length, 2);
});

test("Jimeng validates current help before one submit and downloads final files, ignoring preview URLs", async (t) => {
  const calls = [];
  const { providers } = await fixture(t, {
    runCli: async (name, args) => {
      calls.push({ name, args });
      if (args[1] === "-h")
        return {
          code: 0,
          stdout:
            "--prompt --poll --model_version --ratio --resolution_type --submit_id --download_dir",
          stderr: "",
        };
      if (args[0] === "text2image")
        return {
          code: 0,
          stdout: JSON.stringify({
            submit_id: "dreamina-real-id",
            gen_status: "querying",
          }),
          stderr: "",
        };
      const directory = args
        .find((arg) => arg.startsWith("--download_dir="))
        .slice("--download_dir=".length);
      await writeFile(join(directory, "final.png"), new Uint8Array([1, 2, 3]));
      return {
        code: 0,
        stdout: JSON.stringify({
          gen_status: "success",
          image_url: "https://preview.invalid/not-a-final-download",
        }),
        stderr: "",
      };
    },
  });
  const task = job("jimeng", "text2image", {
    options: { ratio: "1:1", resolution_type: "2k" },
  });
  task.preset.model = "5.0";
  const submitted = await providers.jimeng.submit({}, task);
  assert.equal(submitted.remoteId, "dreamina-real-id");
  assert.deepEqual(calls[1].args, [
    "text2image",
    "--prompt=一辆车",
    "--poll=0",
    "--model_version=5.0",
    "--ratio=1:1",
    "--resolution_type=2k",
  ]);
  const result = await providers.jimeng.query(
    {},
    { ...task, remoteId: submitted.remoteId },
  );
  assert.equal(result.status, "succeeded");
  assert.equal(result.outputs[0].url, undefined);
  assert.deepEqual(
    await readFile(result.outputs[0].path),
    Buffer.from([1, 2, 3]),
  );
});

test("Jimeng first/last frame tasks require both roles and use official CLI flags", async (t) => {
  const calls = [];
  const { providers } = await fixture(t, { runCli: async (_name, args) => {
    calls.push(args);
    return { code: 0, stdout: args[1] === "-h" ? "--first --last --prompt --poll --model_version --video_resolution" : JSON.stringify({ submit_id: "frames-id", gen_status: "querying" }), stderr: "" };
  } });
  const task = job("jimeng", "frames2video", { options: { video_resolution: "720p" } });
  task.preset.model = "seedance2.5";
  task.inputs = [{ role: "image", fileId: "input-file" }];
  await assert.rejects(providers.jimeng.submit({}, task), /首帧和尾帧/);
  assert.equal(calls.length, 0);
  task.inputs.push({ role: "tailImage", fileId: "input-file" });
  assert.equal((await providers.jimeng.submit({}, task)).remoteId, "frames-id");
  assert.ok(calls[1].some(arg => arg.startsWith("--first=")));
  assert.ok(calls[1].some(arg => arg.startsWith("--last=")));
  assert.ok(!calls[1].some(arg => arg.startsWith("--ratio=")));
});

test("Jimeng uses its configured executable for detection, account check, login and generation", async (t) => {
  const calls = [];
  const executable = join(tmpdir(), "selected dreamina.exe");
  const { providers } = await fixture(t, {
    which: async (name, path) => { assert.equal(name, "dreamina"); assert.equal(path, executable); return path; },
    runCli: async (name, args, options) => {
      assert.equal(name, "dreamina");
      assert.equal(options.executable, executable);
      calls.push(args[0]);
      return { code: 0, stdout: args[1] === "-h" ? "--prompt --poll" : JSON.stringify(args[0] === "user_credit" ? { total_credit: 12, user_id: 1, vip_level: "vip" } : { submit_id: "selected-task", gen_status: "querying" }), stderr: "" };
    },
  });
  const config = { executable };
  assert.equal((await providers.jimeng.status(config)).state, "not-connected");
  assert.equal((await providers.jimeng.check(config)).state, "ready");
  await providers.jimeng.login(config, () => {});
  assert.equal((await providers.jimeng.submit(config, job("jimeng", "text2image"))).remoteId, "selected-task");
  assert.deepEqual(calls, ["user_credit", "login", "text2image", "text2image"]);
});

test("RunningHub reports unknown RH coins without inventing a zero balance", async (t) => {
  const { providers } = await fixture(t, { fetch: async () => response({ code: 0, data: { remainCoins: null, currentTaskCounts: null, apiType: "NORMAL" } }) });
  const checked = await providers.runninghub.check({ apiKey: "offline-key" });
  assert.equal(checked.details.remainCoins, undefined);
  assert.equal(checked.details.currentTaskCounts, undefined);
  assert.match(providers.runninghub.billing, /付费积分/);
});

test("RunningHub rejects mapping collisions before upload or paid submission even for raw JSON presets", async (t) => {
  let requests = 0;
  const { providers } = await fixture(t, { fetch: async () => { requests++; throw new Error("Unexpected network"); } });
  const target = { nodeId: "6", fieldName: "text" };
  for (const params of [
    { promptTarget: target, inputTargets: [{ ...target, role: "image" }] },
    { promptTarget: target, nodeInfoList: [{ ...target, fieldValue: "overwrite" }] },
    { nodeInfoList: [{ ...target, fieldValue: "one" }, { ...target, fieldValue: "two" }] },
  ]) {
    const task = job("runninghub", "workflow", params);
    task.preset.remoteId = "workflow";
    await assert.rejects(providers.runninghub.submit({ apiKey: "offline-key" }, task), /冲突|重复/);
  }
  assert.equal(requests, 0);
});

test("unknown response states, missing ids, unsupported options and reflected secrets never become success", async (t) => {
  let count = 0;
  const { providers } = await fixture(t, {
    fetch: async () => {
      count++;
      return response({ code: 0, data: { status: "new-unknown-status" } });
    },
  });
  const task = job("tripo", "text-to-model");
  task.preset.model = "model";
  await assert.rejects(
    providers.tripo.submit({ apiKey: "secret" }, task),
    /平台任务 ID/,
  );
  await assert.rejects(
    providers.tripo.query(
      { apiKey: "secret" },
      { ...task, remoteId: "remote" },
    ),
    /未知任务状态/,
  );
  task.preset.params = { options: { arbitrary: true } };
  await assert.rejects(
    providers.tripo.submit({ apiKey: "secret" }, task),
    /不支持的模型参数/,
  );
  assert.equal(count, 2);
  const failing = await fixture(t, {
    fetch: async () =>
      response({ code: 401, message: "secret", data: { apiKey: "secret" } }),
  });
  await assert.rejects(
    failing.providers.tripo.check({ apiKey: "secret" }),
    (error) => !error.message.includes("secret"),
  );
});

test("success without usable outputs is rejected so the existing remote job can be queried again", async (t) => {
  const { providers } = await fixture(t, {
    fetch: async (url) =>
      response(
        String(url).includes("runninghub")
          ? { status: "SUCCESS", results: [] }
          : { code: 0, data: { generateStatus: 5, images: [] } },
      ),
  });
  await assert.rejects(
    providers.runninghub.query(
      { apiKey: "key" },
      { ...job("runninghub", "workflow"), remoteId: "saved" },
    ),
    /没有可保存/,
  );
  await assert.rejects(
    providers.liblib.query(
      { accessKey: "ak", secretKey: "sk" },
      { ...job("liblib", "workflow"), remoteId: "saved" },
    ),
    /没有可保存/,
  );
});

test("Liblib invalid paths are rejected before upload or paid submission", async (t) => {
  const { providers } = await fixture(t);
  const task = job("liblib", "workflow", {
    generateParams: { 6: { inputs: { text: "" } } },
    promptPath: ["6", "inputs", "typo"],
  });
  task.preset.remoteId = "template-id";
  await assert.rejects(
    providers.liblib.submit({ accessKey: "ak", secretKey: "sk" }, task),
    /路径不存在/,
  );
  task.preset.params.promptPath = ["__proto__", "polluted"];
  await assert.rejects(
    providers.liblib.submit({ accessKey: "ak", secretKey: "sk" }, task),
    /path 必须/,
  );
  assert.equal({}.polluted, undefined);
});

test("CLI login publishes only official user-facing authorization URLs and user codes", async (t) => {
  const messages = [];
  const { providers } = await fixture(t, {
    runCli: async (_name, _args, opts) => {
      opts.onMessage(
        "https://jimeng.jianying.com/authorize?user_code=ABCD-EFGH\n",
      );
      opts.onMessage(
        "https://jimeng.jianying.com/oauth?access_token=secret-token\n",
      );
      opts.onMessage("https://attacker.invalid/login\n");
      opts.onMessage('{"user_code":"ABCD-EFGH","device_code":"never-publish"}');
      return {
        code: 0,
        stdout: '{"access_token":"never-publish"}',
        stderr: "",
      };
    },
  });
  await providers.jimeng.login({}, (message) => messages.push(message));
  assert.ok(
    messages.some(
      (message) =>
        message.url ===
        "https://jimeng.jianying.com/authorize?user_code=ABCD-EFGH",
    ),
  );
  assert.ok(messages.some((message) => message.code === "ABCD-EFGH"));
  assert.ok(!JSON.stringify(messages).includes("secret-token"));
  assert.ok(!JSON.stringify(messages).includes("never-publish"));
  assert.ok(!JSON.stringify(messages).includes("attacker"));
});

test("Jimeng missing runtime flags and killed commands do not fall back or resubmit", async (t) => {
  const calls = [];
  const { providers } = await fixture(t, {
    runCli: async (_name, args) => {
      calls.push(args);
      return { code: 0, stdout: "--prompt --poll", stderr: "" };
    },
  });
  const task = job("jimeng", "text2image", {
    options: { resolution_type: "2k" },
  });
  await assert.rejects(
    providers.jimeng.submit({}, task),
    /未声明 --resolution_type/,
  );
  assert.equal(calls.length, 1);
});
