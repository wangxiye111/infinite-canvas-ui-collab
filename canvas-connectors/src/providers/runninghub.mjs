import {
  bearer,
  bindNode,
  configured,
  credentials,
  filePart,
  inputFor,
  json,
  nonempty,
  output,
  params,
  progress,
  remoteId,
  request,
  required,
  state,
  validateInputs,
} from "./shared.mjs";

const base = "https://www.runninghub.cn";
const knownNumber = value => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value)) ? Number(value) : undefined;
export default function runninghub(ctx) {
  const post = (config, path, body) =>
    request(ctx, base + path, json(body, bearer(config)));
  return {
    id: "runninghub",
    name: "RunningHub",
    auth: "api",
    docs: "https://www.runninghub.cn/runninghub-api-doc-cn/",
    billing:
      "消费级会员 Key 调用工作流和 AI 应用消耗付费积分，与网站任务共用并发；其他 Key 按其对应账户计费",
    fields: [
      { key: "apiKey", label: "API Key", secret: true },
      {
        key: "accessPassword",
        label: "加密应用/工作流访问密码（可选）",
        secret: true,
      },
    ],
    actions: [
      {
        id: "workflow",
        label: "ComfyUI 工作流",
        output: "image",
        requiresRemoteId: true,
        canCancel: true,
      },
      { id: "app", label: "AI 应用", output: "image", requiresRemoteId: true },
    ],
    async status(config) {
      return configured(config, ["apiKey"]);
    },
    async check(config) {
      credentials(config, ["apiKey"]);
      const { data } = await post(config, "/uc/openapi/accountStatus", {
        apikey: config.apiKey,
      });
      if (data?.remainCoins === undefined)
        throw new Error("平台未返回可核验的账户信息");
      return {
        state: "ready",
        message: "账户检查通过，应用/工作流权限以实际预设为准",
        details: {
          remainCoins: knownNumber(data.remainCoins),
          currentTaskCounts: knownNumber(data.currentTaskCounts),
          apiType: ["NORMAL", "ENTERPRISE", "SHARED", "EXCLUSIVE"].includes(
            data.apiType,
          )
            ? data.apiType
            : undefined,
        },
      };
    },
    async submit(config, job) {
      credentials(config, ["apiKey"]);
      const action = job.preset.action;
      if (!["workflow", "app"].includes(action))
        throw new Error("不支持此 RunningHub 操作");
      const p = params(job, [
        "nodeInfoList",
        "promptTarget",
        "inputTargets",
        "outputKind",
      ]);
      if (p.nodeInfoList !== undefined && !Array.isArray(p.nodeInfoList))
        throw new Error("nodeInfoList 必须是数组");
      if (p.inputTargets !== undefined && !Array.isArray(p.inputTargets)) throw new Error("inputTargets 必须是数组");
      const targets = [...(p.nodeInfoList ?? []), ...(p.inputTargets ?? []), ...(p.promptTarget !== undefined ? [p.promptTarget] : [])];
      const used = new Set();
      for (const target of targets) {
        const nodeId = required(target?.nodeId, "映射节点 ID");
        const fieldName = required(target?.fieldName, "映射字段");
        const key = JSON.stringify([nodeId, fieldName]);
        if (used.has(key)) throw new Error(`字段映射冲突：节点 ${nodeId} 的 ${fieldName} 被重复使用`);
        used.add(key);
      }
      const nodeInfoList = structuredClone(p.nodeInfoList ?? []);
      for (const node of nodeInfoList) {
        required(node.nodeId, "节点 ID");
        required(node.fieldName, "节点字段");
      }
      validateInputs(job, p.inputTargets);
      if (job.prompt && !p.promptTarget)
        throw new Error("请先配置 promptTarget 提示词字段映射");
      if (p.promptTarget)
        bindNode(nodeInfoList, p.promptTarget, job.prompt || "");
      for (const target of p.inputTargets ?? []) {
        const { file, blob } = await filePart(ctx, inputFor(job, target.role));
        const form = new FormData();
        form.set("file", blob, file.name);
        const uploaded = await request(
          ctx,
          base + "/openapi/v2/media/upload/binary",
          { method: "POST", headers: bearer(config), body: form },
        );
        bindNode(
          nodeInfoList,
          target,
          required(uploaded.data?.fileName, "平台上传文件名"),
        );
      }
      const id = required(job.preset.remoteId, "平台工作流/应用 ID");
      const body = {
        apiKey: config.apiKey,
        [action === "workflow" ? "workflowId" : "webappId"]: id,
        nodeInfoList,
      };
      if (config.accessPassword) body.accessPassword = config.accessPassword;
      const result = await post(
        config,
        action === "workflow"
          ? "/task/openapi/create"
          : "/task/openapi/ai-app/run",
        body,
      );
      return {
        remoteId: required(result.data?.taskId, "平台任务 ID"),
        status: "queued",
      };
    },
    async query(config, job) {
      const result = await post(config, "/openapi/v2/query", {
        taskId: remoteId(job),
      });
      const data = result.data ?? result;
      const status = state(data.status, {
        queued: "queued",
        running: "running",
        success: "succeeded",
        failed: "failed",
        canceled: "cancelled",
        cancelled: "cancelled",
      });
      return {
        status,
        progress: progress(data.progress),
        ...(status === "succeeded"
          ? {
              outputs: nonempty(
                (data.results ?? []).map((item) =>
                  output(
                    required(item.url, "平台结果地址"),
                    kind(item.outputType, job.preset.params?.outputKind),
                  ),
                ),
              ),
            }
          : {}),
        ...(status === "failed"
          ? { message: "RunningHub 任务失败，请在平台核查任务记录" }
          : {}),
      };
    },
    async cancel(config, job) {
      if (job.preset.action !== "workflow")
        throw new Error("仅 ComfyUI 工作流支持平台取消请求");
      await post(config, "/task/openapi/cancel", {
        apiKey: config.apiKey,
        taskId: remoteId(job),
      });
      return {
        status: "running",
        message: "已向平台发送取消请求，请刷新任务确认最终状态与扣费",
      };
    },
  };
}
function kind(value, fallback = "image") {
  const type = String(value || "").toLowerCase();
  if (["video", "mp4", "mov", "webm"].includes(type)) return "video";
  if (["audio", "mp3", "wav", "flac"].includes(type)) return "audio";
  if (["glb", "gltf", "model3d", "3d"].includes(type)) return "model3d";
  if (["image", "png", "jpg", "jpeg", "webp"].includes(type)) return "image";
  if (!["image", "video", "audio", "model3d"].includes(fallback))
    throw new Error("请配置正确的 outputKind");
  return fallback;
}
