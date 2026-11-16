import { link, mkdir, mkdtemp, readFile, readdir, realpath, rm } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { cliEntry } from "../cli-process.mjs";
import { jimengModels } from "./jimeng-models.mjs";
import {
  nonempty,
  options,
  output,
  params,
  progress,
  remoteId,
  required,
  state,
} from "./shared.mjs";

const executableField = { key: "executable", label: "已安装工具的位置（可选）", placeholder: "留空自动查找；未找到时填写可执行文件的完整路径" };
const klingImageExtensions = new Map([["image/png", ".png"], ["image/jpeg", ".jpg"], ["image/webp", ".webp"], ["image/gif", ".gif"]]);
const klingInputError = () => Object.assign(new Error("可灵不支持这张参考图的格式，请换用 PNG 或 JPEG；生成未提交"), { code: "KLING_INPUT_REJECTED" });
function configuredCli(ctx, config = {}) {
  return {
    ...ctx,
    which: (name) => ctx.which(name, config.executable || undefined),
    runCli: (name, args, options) => ctx.runCli(name, args, { ...options, executable: config.executable || undefined }),
  };
}

async function cli(ctx, name, args) {
  let result;
  try {
    result = await ctx.runCli(name, args);
  } catch {
    throw new Error(`${name} 无法启动，请检查官方 CLI 安装`);
  }
  if (name === "kling" && result.code !== 0 && /Failed to upload[^\r\n]*AGENT\.UnsupportedFileType/.test(`${result.stdout}\n${result.stderr}`))
    throw klingInputError();
  if (result.code !== 0)
    throw new Error(
      `${name} 命令未成功，请检查官方 CLI 登录、权限与平台任务记录`,
    );
  let data;
  try {
    data = JSON.parse(result.stdout.trim());
  } catch {
    throw new Error(`${name} 未返回可识别的 JSON；请保留已有任务，勿重复提交`);
  }
  if (data.ok === false || (data.ret !== undefined && data.ret !== 0))
    throw new Error(`${name} 拒绝请求，请在官方 CLI 检查账户与任务记录`);
  return data.body ?? data;
}
async function help(ctx, name, action, flags) {
  const result = await ctx.runCli(name, [action, "-h"]);
  if (result.code !== 0) throw new Error(`${name} 命令帮助不可用，未提交任务`);
  for (const flag of flags)
    if (!`${result.stdout}\n${result.stderr}`.includes(`--${flag}`))
      throw new Error(`当前 ${name} 未声明 --${flag}，未提交任务`);
}
async function localStatus(ctx, name) {
  return (await ctx.which(name))
    ? {
        state: "not-connected",
        message: `已找到 ${name}，请进行只读账户检查；安装不代表已授权或有额度`,
      }
    : {
        state: "not-installed",
        message: `未找到官方 ${name} CLI，请按官方说明安装`,
      };
}
async function cnPackage(ctx) {
  const executable = await ctx.which("kling");
  if (!executable) throw new Error("请先安装国内官方 @klingai/cli-cn");
  let path;
  try {
    path = dirname(await realpath(cliEntry(executable)));
  } catch {
    throw new Error("无法确认可灵 CLI 安装位置");
  }
  while (path !== dirname(path)) {
    try {
      const metadata = JSON.parse(
        await readFile(join(path, "package.json"), "utf8"),
      );
      if (metadata.name === "@klingai/cli-cn") return;
      if (metadata.name === "@klingai/cli-global")
        throw new Error("当前为全球可灵 CLI；本接入仅支持国内 @klingai/cli-cn");
    } catch (error) {
      if (error.message.startsWith("当前为")) throw error;
    }
    path = dirname(path);
  }
  throw new Error("无法确认国内官方 @klingai/cli-cn 安装包，请按官方指南安装");
}
function login(ctx, name, allowedHosts) {
  return async (_config, onMessage) => {
    const notify = (chunk) => {
      const text = typeof chunk === "string" ? chunk : "";
      const urls = text.match(/https:\/\/[^\s<>"']+/g) ?? [];
      for (const value of urls) {
        try {
          const url = new URL(value);
          if (
            allowedHosts.some(
              (host) =>
                url.hostname === host || url.hostname.endsWith(`.${host}`),
            )
          ) {
            if (
              url.username ||
              url.password ||
              [...url.searchParams.keys()].some((key) =>
                /token|secret|password|device_code|^code$/i.test(key),
              ) ||
              /token|secret|password|device_code/i.test(url.hash)
            )
              continue;
            onMessage({
              message: "请在官方页面完成授权，等待 CLI 确认",
              url: url.href,
            });
          }
        } catch {}
      }
      const match = text.match(
        /(?:user_code|用户码|验证码)["']?\s*[=:：]\s*["']?([A-Z0-9]{3,}(?:-[A-Z0-9]+)?)/i,
      );
      if (match)
        onMessage({
          message: "请在官方授权页面核对一次性验证码",
          code: match[1],
        });
    };
    const result = await ctx.runCli(name, ["login"], { onMessage: notify });
    notify(result.stdout);
    if (result.code !== 0)
      throw new Error(`${name} 授权未完成，请使用官方 CLI 查看授权状态`);
    onMessage({ message: "CLI 登录命令已完成，请点击检查连接确认账户状态" });
  };
}
export function kling(ctx) {
  const actions = [
    "text_to_image",
    "image_to_image",
    "text_to_video",
    "image_to_video",
  ];
  return {
    id: "kling",
    name: "可灵国内站",
    auth: "cli",
    fields: [executableField],
    docs: "https://klingai.com/app/mcp/guide",
    billing: "官方 CLI 仅消耗个人空间付费灵感值，赠送积分和团队权益不适用",
    actions: actions.map((id) => ({
      id,
      label: {
        text_to_image: "文生图",
        image_to_image: "参考图生图",
        text_to_video: "文生视频",
        image_to_video: "图生视频/关键帧",
      }[id],
      output: id.endsWith("image") ? "image" : "video",
      requiresModel: true,
    })),
    async status(config) {
      return localStatus(configuredCli(ctx, config), "kling");
    },
    async check(config) {
      const runtime = configuredCli(ctx, config);
      if (!(await runtime.which("kling"))) return localStatus(runtime, "kling");
      await cnPackage(runtime);
      const identity = await cli(runtime, "kling", ["who_am_i"]);
      const account = await cli(runtime, "kling", ["account"]);
      if (
        !identity.user?.userId ||
        !identity.availableModels ||
        !Number.isFinite(Number(account.availableRemainCredits))
      )
        throw new Error("可灵 CLI 未返回可核验的身份、模型与余额");
      return {
        state: "ready",
        message: "国内 CLI 账户检查通过，仅可用个人付费灵感值",
        details: {
          availableRemainCredits: Number(account.availableRemainCredits),
          models: Object.fromEntries(
            actions.map((action) => [
              action,
              (identity.availableModels[action]?.models ?? []).map((model) => ({
                model: model.model,
                inputs: (model.inputs ?? []).map(({ name, required }) => ({ name, required })),
                arguments: (model.arguments ?? []).map((arg) => ({
                  name: arg.name,
                  required: arg.required,
                  allowedValues: arg.allowedValues,
                  default: arg.default,
                })),
              })),
            ]),
          ),
        },
      };
    },
    login: async (config, onMessage) => {
      const runtime = configuredCli(ctx, config);
      await cnPackage(runtime);
      return login(runtime, "kling", ["klingai.com", "kuaishou.com"])(
        config,
        onMessage,
      );
    },
    async submit(config, job) {
      const runtime = configuredCli(ctx, config);
      await cnPackage(runtime);
      if (!actions.includes(job.preset.action))
        throw new Error("不支持此可灵操作");
      const identity = await cli(runtime, "kling", ["who_am_i"]);
      const model = identity.availableModels?.[job.preset.action]?.models?.find(item => item.model === job.preset.model);
      if (!model) throw new Error("当前账号未提供此可灵模型，请重新检查连接并选择模型");
      const p = params(job, ["options"]);
      const opts = options(p.options, (model.arguments ?? []).filter(arg => arg.name !== "prompt").map(arg => arg.name));
      const args = [
        job.preset.action,
        `--model=${required(job.preset.model, "模型名称")}`,
        `--prompt=${job.prompt || ""}`,
      ];
      for (const [key, value] of Object.entries(opts))
        args.push(`--${key}=${value}`);
      let imageIndex = 0;
      const usedInputs = new Set();
      const files = [];
      for (const input of job.inputs ?? []) {
        if (!job.preset.action.startsWith("image_to_"))
          throw new Error("文生任务不接受素材输入");
        if (
          !["image", "tailImage"].includes(input.role || "image") ||
          (input.role === "tailImage" && job.preset.action !== "image_to_video")
        )
          throw new Error("可灵输入角色仅支持 image 或图生视频的 tailImage");
        const name = job.preset.action === "image_to_image" ? `image_${++imageIndex}` : input.role === "tailImage" ? "tail_image" : "first_image";
        if (!model.inputs?.some(slot => slot.name === name) || usedInputs.has(name)) throw new Error("此模型不支持当前参考图用途，请换用支持首尾帧或参考图的模型");
        usedInputs.add(name);
        const file = await ctx.getFile(input.fileId);
        const extension = klingImageExtensions.get(file.mimeType);
        if (!extension) throw klingInputError();
        files.push({ name, path: file.path, extension });
      }
      if (model.inputs?.some(slot => slot.required && !usedInputs.has(slot.name))) throw new Error("此可灵模型缺少必需的参考素材");
      const staging = files.length ? await mkdtemp(join(dirname(files[0].path), "kling-input-")) : undefined;
      try {
        for (const file of files) {
          // Kling derives the multipart filename and MIME type from the path, not the file metadata.
          const path = join(staging, file.name + file.extension);
          await link(file.path, path);
          args.push(`--input=${file.name}=${path}`);
        }
        args.push("--poll=0");
        const data = await cli(runtime, "kling", args);
        return { remoteId: required(data.generationId, "平台生成 ID"), status: "queued" };
      } finally {
        if (staging) await rm(staging, { recursive: true, force: true }).catch(() => {});
      }
    },
    async query(config, job) {
      const runtime = configuredCli(ctx, config);
      await cnPackage(runtime);
      const data = await cli(runtime, "kling", ["query_tasks", remoteId(job)]);
      const status = state(data.status, {
        queuing: "queued",
        queueing: "queued",
        pending: "queued",
        submitted: "queued",
        running: "running",
        processing: "running",
        completed: "succeeded",
        partial_completed: "succeeded",
        succeed: "succeeded",
        succeeded: "succeeded",
        success: "succeeded",
        failed: "failed",
        cancelled: "cancelled",
        canceled: "cancelled",
      });
      return {
        status,
        ...(status === "succeeded"
          ? {
              outputs: nonempty(
                (data.works ?? [])
                  .filter((work) => work.url)
                  .map((work) =>
                    output(
                      work.url,
                      work.contentType === "video" ? "video" : "image",
                    ),
                  ),
              ),
            }
          : {}),
        ...(status === "failed"
          ? { message: "可灵任务失败，请在平台核查任务记录" }
          : {}),
      };
    },
  };
}
export function jimeng(ctx) {
  const actions = ["text2image", "image2image", "text2video", "image2video", "frames2video"];
  return {
    id: "jimeng",
    name: "即梦",
    auth: "cli",
    fields: [executableField],
    docs: "https://jimeng.jianying.com/ai-tool/install",
    billing:
      "使用官方 dreamina 独立生成 CLI 的账户权益；当前账户可用性需实际授权检查",
    actions: actions.map((id) => ({
      id,
      label: {
        text2image: "文生图",
        image2image: "参考图生图",
        text2video: "文生视频",
        image2video: "图生视频",
        frames2video: "首尾帧生视频",
      }[id],
      output: id.endsWith("image") ? "image" : "video",
    })),
    async status(config) {
      return localStatus(configuredCli(ctx, config), "dreamina");
    },
    async check(config) {
      const runtime = configuredCli(ctx, config);
      if (!(await runtime.which("dreamina"))) return localStatus(runtime, "dreamina");
      const account = await cli(runtime, "dreamina", ["user_credit"]);
      if (!Number.isFinite(account.total_credit) || !account.user_id || typeof account.vip_level !== "string") throw new Error("即梦未返回有效的账户信息，请重新完成官方授权");
      return {
        state: "ready",
        message: "即梦官方 CLI 已连接，可在图片或视频节点选择模型；实际生成仍受会员权益与积分约束",
        details: { models: jimengModels, availableCredits: account.total_credit },
      };
    },
    login: (config, onMessage) => login(configuredCli(ctx, config), "dreamina", ["jianying.com", "douyin.com", "bytedance.com"])(config, onMessage),
    async submit(config, job) {
      const runtime = configuredCli(ctx, config);
      const action = job.preset.action;
      if (!actions.includes(action)) throw new Error("不支持此即梦操作");
      const p = params(job, ["options"]);
      const opts = options(
        p.options,
        action.endsWith("image")
          ? ["ratio", "resolution_type", "generate_num", "width", "height"]
          : ["ratio", "video_resolution", "duration"],
      );
      const flags = ["prompt", "poll", ...Object.keys(opts)];
      const args = [action, `--prompt=${job.prompt || ""}`, "--poll=0"];
      if (job.preset.model) {
        args.push(`--model_version=${job.preset.model}`);
        flags.push("model_version");
      }
      for (const [key, value] of Object.entries(opts))
        args.push(`--${key}=${value}`);
      const files = [];
      for (const input of job.inputs ?? []) {
        if (action === "frames2video") {
          if (!["image", "tailImage"].includes(input.role)) throw new Error("首尾帧素材请选择首帧和尾帧用途");
          const flag = input.role === "image" ? "first" : "last";
          if (flags.includes(flag)) throw new Error("首帧和尾帧各需一张图片");
          args.push(`--${flag}=${(await ctx.getFile(input.fileId)).path}`);
          flags.push(flag);
          continue;
        }
        if (!action.startsWith("image2") || (input.role || "image") !== "image")
          throw new Error("此即梦操作只接受 image 角色图片");
        files.push((await ctx.getFile(input.fileId)).path);
      }
      if (action === "frames2video" && (!flags.includes("first") || !flags.includes("last"))) throw new Error("请指定首帧和尾帧图片");
      if (action === "image2video" && files.length !== 1)
        throw new Error("即梦图生视频需要一张图片");
      if (action === "image2image" && !files.length)
        throw new Error("即梦参考图生图需要图片");
      if (files.length) {
        const flag = action === "image2image" ? "images" : "image";
        args.push(`--${flag}=${files.join(",")}`);
        flags.push(flag);
      }
      await help(runtime, "dreamina", action, flags);
      const data = await cli(runtime, "dreamina", args);
      const body = data.data ?? data;
      return {
        remoteId: required(body.submit_id, "平台提交 ID"),
        status: state(body.gen_status, {
          querying: "queued",
          success: "running",
          fail: "failed",
        }),
      };
    },
    async query(config, job) {
      const runtime = configuredCli(ctx, config);
      const directory = resolve(
        ctx.dataDir,
        "cli-results",
        required(job.id, "本地任务 ID"),
      );
      if (dirname(directory) !== resolve(ctx.dataDir, "cli-results"))
        throw new Error("无效的本地任务 ID");
      await help(runtime, "dreamina", "query_result", [
        "submit_id",
        "download_dir",
      ]);
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const data = await cli(runtime, "dreamina", [
        "query_result",
        `--submit_id=${remoteId(job)}`,
        `--download_dir=${directory}`,
      ]);
      const body = data.data ?? data;
      const status = state(body.gen_status, {
        querying: "running",
        success: "succeeded",
        fail: "failed",
      });
      const outputs = [];
      if (status === "succeeded") {
        for (const entry of await readdir(directory, { withFileTypes: true })) {
          const mime = {
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".webp": "image/webp",
            ".mp4": "video/mp4",
            ".webm": "video/webm",
          }[extname(entry.name).toLowerCase()];
          if (entry.isFile() && mime)
            outputs.push({
              path: join(directory, entry.name),
              name: entry.name,
              mimeType: mime,
              kind: mime.startsWith("video/") ? "video" : "image",
            });
        }
        if (!outputs.length)
          throw Object.assign(new Error(
            "即梦任务已成功，但未下载到结果文件；请刷新同一任务重试下载，勿重新生成",
          ), { code: "RESULT_SAVE_FAILED" });
      }
      return {
        status,
        progress: progress(body.progress),
        outputs,
        ...(status === "failed"
          ? { message: "即梦任务失败，请在平台核查任务记录" }
          : {}),
      };
    },
  };
}
