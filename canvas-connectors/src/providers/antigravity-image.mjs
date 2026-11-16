import * as acp from "@agentclientprotocol/sdk";
import sharp from "sharp";
import { createHash } from "node:crypto";
import { Readable, Writable } from "node:stream";
import { lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnCli, stopCli } from "../cli-process.mjs";

const imageAdapter = "antigravity-acp";
const agentName = "canvas-native-image";
const agentDefinition = `---
name: ${agentName}
description: Generate images using only the native generate_image tool.
tools:
  - generate_image
mainAgent: true
subagent: false
commandExecutionPolicy: off
---
Use generate_image directly for the requested image. Never delegate or invoke subagents. Do not run commands, read unrelated files, or call other tools. Do not retry a failed generation. Return the actual generated image content.
`;

export async function prepareAntigravityImageAgent(cwd) {
  const directory = join(cwd, ".agents/agents");
  const path = join(directory, `${agentName}.md`);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if (!samePath(await realpath(directory), directory)) throw new Error("Antigravity 图片代理配置路径无效");
  try { await writeFile(path, agentDefinition, { flag: "wx", mode: 0o600 }); }
  catch (error) { if (error.code !== "EEXIST" || (await readFile(path, "utf8")) !== agentDefinition) throw new Error("Antigravity 图片代理配置无法准备，请检查本地任务目录"); }
  if ((await lstat(path)).isSymbolicLink()) throw new Error("Antigravity 图片代理配置路径无效");
}

function open(options, onUpdate = () => {}) {
  options.signal?.throwIfAborted();
  const env = { ...(options.env || process.env) };
  for (const key of ["GEMINI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_APPLICATION_CREDENTIALS", "GOOGLE_CLOUD_PROJECT", "GOOGLE_CLOUD_LOCATION", "GOOGLE_GENAI_USE_VERTEXAI", "AGY_ADC_AUTH", "GOOGLE_CLOUD_QUOTA_PROJECT", "GOOGLE_GEMINI_BASE_URL"]) delete env[key];
  const args = ["acp", ...(options.imageAgent === false ? [] : ["--agent", agentName]), "--sandbox", "--disable-telemetry"];
  const child = (options.spawn || spawnCli)(options.executable, args, {
    cwd: options.cwd, env, shell: false, windowsHide: true,
    detached: process.platform !== "win32", stdio: ["pipe", "pipe", "pipe"],
  });
  // Account diagnostics must not be copied into jobs, output files, or UI errors.
  child.stderr?.resume();
  child.stdin?.on("error", () => {});
  let sessionId, closing, denied = false;
  const connection = acp.client({ name: "infinite-canvas" })
    .onRequest(acp.methods.client.session.requestPermission, ({ params }) => {
      const tool = params.toolCall, input = tool.rawInput;
      const scoped = params.sessionId === sessionId && tool.name === "generate_image" && input && typeof input.Prompt === "string" && input.Prompt.trim() && typeof input.ImageName === "string" && /^[a-zA-Z0-9_-]+$/.test(input.ImageName) && Object.keys(input).every(key => ["Prompt", "ImageName", "AspectRatio", "ImagePaths"].includes(key)) && (input.AspectRatio === undefined || /^[1-9]\d*:[1-9]\d*$/.test(input.AspectRatio)) && (input.ImagePaths === undefined || (Array.isArray(input.ImagePaths) && input.ImagePaths.every(path => (options.referencePaths || []).some(reference => typeof path === "string" && samePath(path, reference)))));
      if (scoped) {
        const allow = params.options.find(option => option.kind === "allow_once");
        if (allow) return { outcome: { outcome: "selected", optionId: allow.optionId } };
      }
      // A display title is not a tool identity. Unknown requests remain denied.
      denied = true;
      const reject = params.options.find(option => option.kind === "reject_once");
      return { outcome: reject ? { outcome: "selected", optionId: reject.optionId } : { outcome: "cancelled" } };
    })
    .onNotification(acp.methods.client.session.update, ({ params }) => {
      if (sessionId && params.sessionId === sessionId) onUpdate(params.update);
    })
    .connect(acp.ndJsonStream(Writable.toWeb(child.stdin), Readable.toWeb(child.stdout)));
  child.once("error", () => connection.close(new Error("Antigravity CLI 启动失败，请检查安装路径")));
  child.once("close", () => connection.close());
  const request = (method, params) => connection.agent.request(method, params, { cancellationSignal: options.signal, stopWaitingOnCancel: true });
  const close = () => {
    if (!closing) closing = (async () => {
      options.signal?.removeEventListener("abort", abort);
      // Killing before closing stdio avoids racing Windows taskkill with the
      // agent's own EOF shutdown, where the OS exit precedes Node's exit event.
      try { await (options.kill || ((process) => stopCli(process, globalThis.process.platform !== "win32")))(child); }
      finally { connection.close(); }
      await connection.closed;
    })();
    return closing;
  };
  const cancel = async () => {
    if (sessionId && !connection.signal.aborted) {
      // Notification writes may be blocked behind the prompt; process shutdown
      // must not depend on the agent reading stdin again.
      void connection.agent.notify(acp.methods.agent.session.cancel, { sessionId }).catch(() => {});
    }
    await close();
  };
  const abort = () => { void cancel().catch(() => {}); };
  options.signal?.addEventListener("abort", abort, { once: true });
  if (options.signal?.aborted) abort();
  return {
    child, request, close, cancel,
    get denied() { return denied; },
    initialize: () => request(acp.methods.agent.initialize, { protocolVersion: acp.PROTOCOL_VERSION, clientInfo: { name: "infinite-canvas", version: "1" }, clientCapabilities: {} }),
    async newSession() {
      const result = await request(acp.methods.agent.session.new, { cwd: options.cwd, mcpServers: [] });
      if (typeof result.sessionId !== "string" || !result.sessionId) throw new Error("Antigravity 未返回有效会话");
      sessionId = result.sessionId;
      return result;
    },
  };
}

export async function checkAntigravityImage(options) {
  let client;
  try {
    const cwd = join(options.cwd, "antigravity-image-check");
    await prepareAntigravityImageAgent(cwd);
    client = open({ ...options, cwd });
    const initialized = await client.initialize();
    const supported = initialized.protocolVersion === 1 && initialized.agentInfo?.name === "Antigravity ACP Server" && initialized.agentCapabilities?.promptCapabilities?.image === true && initialized.authMethods?.some(method => method.id === "oauth-personal");
    if (!supported) return { imageAdapter, loginState: "unchecked", imageAvailable: false, imageDriverState: "unavailable", imageMessage: "此 CLI 未提供所需图片协议，请更新官方 Antigravity 后重新检查。" };
    const session = await client.newSession();
    const tier = session._meta?.antigravity?.tier;
    const available = typeof tier?.id === "string" && typeof tier?.name === "string";
    return { imageAdapter, loginState: "authenticated", imageAvailable: available, imageDriverState: available ? "available" : "unavailable", ...(available ? { imageDriverSource: "official-native-tool", accountTier: tier.name } : {}), imageMessage: available ? "Google 账号已连接，可以使用 Gemini 生图。" : "已登录，但未取得 Google 账号的图片连接信息，请重新登录后检查。" };
  } catch (error) {
    if (options.signal?.aborted) throw options.signal.reason;
    return { imageAdapter, loginState: "not-authenticated", imageAvailable: false, imageDriverState: "unavailable", imageMessage: error.code === -32000 ? "请先登录 Google 账号。" : "暂时无法连接 Antigravity，请检查安装后重试。" };
  } finally { await client?.close(); }
}

export async function loginAntigravity(options) {
  let client;
  try {
    client = open({ ...options, imageAgent: false });
    const initialized = await client.initialize();
    if (!initialized.authMethods?.some(method => method.id === "oauth-personal")) throw new Error("此 Antigravity 未提供个人 Google 登录，请更新官方 CLI");
    options.onMessage?.({ message: "请在官方浏览器页面完成 Google 登录" });
    await client.request(acp.methods.agent.authenticate, { methodId: "oauth-personal" });
  } catch (error) {
    if (options.signal?.aborted) throw options.signal.reason;
    if (/^此 Antigravity/.test(error.message)) throw error;
    throw new Error("Google 登录未完成，请在官方页面检查后重新登录");
  } finally { await client?.close(); }
}

const samePath = (left, right) => process.platform === "win32" ? resolve(left).toLowerCase() === resolve(right).toLowerCase() : resolve(left) === resolve(right);
async function actualFile(path) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || !samePath(await realpath(path), path)) throw new Error("Antigravity 图片来源路径无效");
  return info;
}

const canonical = value => JSON.stringify(value && typeof value === "object" && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) : value);

export async function readAntigravityImageArtifacts({ homeDir = homedir(), sessionId, calls, startedAt }) {
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(sessionId || "")) throw new Error("Antigravity 未返回可核验的图片会话标识");
  const completed = calls.filter(call => call.name === "generate_image" && call.status === "completed");
  if (!completed.length) throw new Error("Antigravity 图片工具未完成");
  const directory = join(homeDir, ".gemini/antigravity-cli/brain", sessionId);
  const manifest = join(directory, ".system_generated/logs/transcript_full.jsonl");
  try {
    const folder = await lstat(directory);
    if (!folder.isDirectory() || folder.isSymbolicLink() || !samePath(await realpath(directory), directory)) throw new Error("invalid image directory");
    await actualFile(manifest);
    const rows = (await readFile(manifest, "utf8")).split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
    const images = [], seen = new Set();
    for (let index = 0; index < rows.length - 1; index++) {
      const callStep = rows[index], outputStep = rows[index + 1];
      if (callStep.source !== "MODEL" || callStep.type !== "PLANNER_RESPONSE" || callStep.status !== "DONE" || callStep.tool_calls?.length !== 1) continue;
      const tool = callStep.tool_calls[0];
      if (tool.name !== "generate_image" || !completed.some(call => canonical(call.rawInput) === canonical(tool.args))) continue;
      const createdAt = Date.parse(outputStep.created_at);
      if (outputStep.source !== "MODEL" || outputStep.type !== "GENERIC" || outputStep.status !== "DONE" || outputStep.step_index !== callStep.step_index + 1 || !Number.isFinite(createdAt) || !Number.isFinite(startedAt) || Math.floor(createdAt / 1000) < Math.floor(startedAt / 1000)) continue;
      for (const media of outputStep.media || []) {
        if (typeof media.uri !== "string" || !media.uri.startsWith("file:") || !/^image\/(png|jpeg|webp|gif)$/.test(media.mime_type)) throw new Error("invalid image resource");
        const path = fileURLToPath(media.uri);
        if (!samePath(dirname(path), directory)) throw new Error("image outside native session");
        const info = await actualFile(path);
        if (Math.floor(info.mtimeMs / 1000) < Math.floor(startedAt / 1000) || Math.floor(info.birthtimeMs / 1000) < Math.floor(startedAt / 1000)) throw new Error("image predates request");
        if (!seen.has(path)) {
          const image = { type: "image", mimeType: media.mime_type, data: (await readFile(path)).toString("base64") };
          await decodeImage(image);
          seen.add(path); images.push(image);
        }
      }
    }
    if (!images.length) throw new Error("no generated image artifact");
    return images;
  } catch { throw new Error("未找到与本次 Antigravity 生成工具对应的完整图片文件"); }
}

function contentImages(update) {
  if (update.sessionUpdate === "agent_message_chunk") return update.content?.type === "image" ? [update.content] : [];
  if (update.sessionUpdate === "tool_call_update" || update.sessionUpdate === "tool_call")
    return (update.content || []).filter(item => item.type === "content" && item.content?.type === "image").map(item => item.content);
  return [];
}

async function decodeImage(content) {
  const formats = { "image/png": "png", "image/jpeg": "jpeg", "image/webp": "webp", "image/gif": "gif" };
  if (!formats[content.mimeType] || typeof content.data !== "string" || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(content.data)) throw new Error("Antigravity 返回的图片格式无效");
  const bytes = Buffer.from(content.data, "base64");
  try {
    const decoder = sharp(bytes, { failOn: "warning" });
    const metadata = await decoder.metadata();
    if (metadata.format !== formats[content.mimeType] || !metadata.width || !metadata.height) throw new Error("image type mismatch");
    await decoder.raw().toBuffer();
  } catch { throw new Error("Antigravity 返回的图片无法完整解码"); }
  return { bytes, mimeType: content.mimeType, extension: content.mimeType === "image/jpeg" ? "jpg" : formats[content.mimeType] };
}

export function startAntigravityImage(options) {
  const images = [], seen = new Set(), calls = new Map();
  const client = open(options, update => {
    if (["tool_call", "tool_call_update"].includes(update.sessionUpdate) && typeof update.toolCallId === "string") calls.set(update.toolCallId, { ...calls.get(update.toolCallId), ...update });
    for (const content of contentImages(update)) {
      const key = createHash("sha256").update(`${content.mimeType}:${content.data}`).digest("hex");
      if (!seen.has(key)) { seen.add(key); images.push({ content, toolCallId: update.toolCallId }); }
    }
  });
  const completion = (async () => {
    try {
      const initialized = await client.initialize();
      if (options.references?.length && !initialized.agentCapabilities?.promptCapabilities?.image) throw new Error("此 Antigravity 会话不支持参考图片");
      const session = await client.newSession();
      await options.onSession?.(session.sessionId);
      options.signal?.throwIfAborted();
      const prompt = [{ type: "text", text: [
        "请使用原生 generate_image 工具完成图片请求，通过 ACP 返回真实图片内容。不要运行终端命令、读写其他文件、调用其他平台，也不要自动重试失败的生成。",
        `生成要求：${JSON.stringify(options.values || {})}。以工具实际输出为准，不要为补足张数另行生成。`,
        `用户图片描述：\n${options.prompt}`,
      ].join("\n\n") }, ...(options.references || [])];
      const startedAt = Date.now();
      const result = await client.request(acp.methods.agent.session.prompt, { sessionId: session.sessionId, prompt });
      options.signal?.throwIfAborted();
      if (result.stopReason !== "end_turn") throw new Error("Antigravity 图片任务未完成");
      const completed = [...calls.values()].filter(call => call.name === "generate_image" && call.status === "completed");
      const referenceData = new Set((options.references || []).map(image => image.data));
      let results = images.filter(image => !referenceData.has(image.content.data) && image.toolCallId && completed.some(call => call.toolCallId === image.toolCallId)).map(image => image.content);
      if (!results.length) {
        if (client.denied) throw new Error("Antigravity 请求了尚未识别的工具权限，未取得图片");
        results = await readAntigravityImageArtifacts({ homeDir: options.homeDir, sessionId: session.sessionId, calls: [...calls.values()], startedAt });
      }
      // Decode every result before writing any, so corrupt previews cannot become outputs.
      const decoded = await Promise.all(results.map(decodeImage));
      const outputs = [];
      for (const image of decoded) {
        options.signal?.throwIfAborted();
        const path = join(options.cwd, `image-${outputs.length + 1}.${image.extension}`);
        await writeFile(path, image.bytes, { flag: "wx", mode: 0o600 });
        outputs.push({ path, name: basename(path), mimeType: image.mimeType, kind: "image" });
      }
      return { outputs };
    } catch (error) {
      if (options.signal?.aborted) throw options.signal.reason;
      if (/^Antigravity|^此 Antigravity/.test(error.message)) throw error;
      throw new Error("Antigravity 图片请求未完成，请检查官方客户端；原任务不会自动重投");
    } finally { await client.close(); }
  })();
  return { child: client.child, completion, cancel: client.cancel };
}
