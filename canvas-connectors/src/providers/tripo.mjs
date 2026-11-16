import {
  bearer,
  configured,
  credentials,
  filePart,
  inputFor,
  json,
  options,
  output,
  params,
  progress,
  remoteId,
  request,
  required,
  state,
} from "./shared.mjs";

const base = "https://openapi.tripo3d.com/v3";
const fields = [{ key: "apiKey", label: "国内站 API Key", secret: true }];
export default function tripo(ctx) {
  return {
    id: "tripo",
    name: "Tripo 国内站",
    auth: "api",
    fields,
    docs: "https://developers.tripo3d.com/zh/docs/introduction",
    billing: "国内站 API 独立额度；网页/App 会员权益与国内赠额需另行核实",
    actions: [
      {
        id: "text-to-model",
        label: "文生 3D",
        output: "model3d",
        requiresModel: true,
      },
      {
        id: "image-to-model",
        label: "图生 3D",
        output: "model3d",
        requiresModel: true,
      },
    ],
    async status(config) {
      return configured(config, ["apiKey"]);
    },
    async check(config) {
      credentials(config, ["apiKey"]);
      const { data } = await request(ctx, `${base}/account/balance`, {
        headers: bearer(config),
      });
      if (typeof data?.balance !== "number")
        throw new Error("平台未返回可核验的余额");
      return {
        state: "ready",
        message:
          data.balance > 0
            ? "国内 API 账户检查通过，生成权限以实际任务为准"
            : "账户检查通过，当前可用 API 积分为零",
        details: { balance: data.balance, frozen: Number(data.frozen) || 0 },
      };
    },
    async submit(config, job) {
      credentials(config, ["apiKey"]);
      if (!["text-to-model", "image-to-model"].includes(job.preset.action))
        throw new Error("不支持此 Tripo 操作");
      const p = params(job, ["options"]);
      const body = {
        ...options(p.options, [
          "texture",
          "pbr",
          "face_limit",
          "texture_quality",
          "texture_version",
          "texture_seed",
          "model_seed",
          "geometry_quality",
          "auto_size",
          "smart_low_poly",
          "compress",
          "enable_image_autofix",
          "texture_alignment",
          "orientation",
          "export_uv",
        ]),
        model: required(job.preset.model, "Tripo 模型版本"),
      };
      if (job.preset.action === "text-to-model") {
        if (job.inputs?.length)
          throw new Error("文生 3D 不接受文件输入，请改用图生 3D");
        body.prompt = required(job.prompt, "提示词");
      } else {
        if (job.inputs?.length !== 1) throw new Error("图生 3D 需要一张图片");
        const { file, blob } = await filePart(ctx, inputFor(job));
        if (!["image/png", "image/jpeg"].includes(file.mimeType))
          throw new Error("Tripo 上传仅支持 PNG/JPEG 图片");
        const form = new FormData();
        form.set("file", blob, file.name);
        const uploaded = await request(ctx, `${base}/files`, {
          method: "POST",
          headers: bearer(config),
          body: form,
        });
        body.input = required(uploaded.data?.file_token, "平台上传 token");
      }
      const result = await request(
        ctx,
        `${base}/generation/${job.preset.action}`,
        json(body, bearer(config)),
      );
      return {
        remoteId: required(result.data?.task_id, "平台任务 ID"),
        status: "queued",
      };
    },
    async query(config, job) {
      const { data } = await request(
        ctx,
        `${base}/tasks/${encodeURIComponent(remoteId(job))}`,
        { headers: bearer(config) },
      );
      const status = state(data?.status, {
        queued: "queued",
        running: "running",
        success: "succeeded",
        failed: "failed",
        cancelled: "cancelled",
        banned: "failed",
        expired: "failed",
      });
      return {
        status,
        progress: progress(data.progress),
        ...(status === "succeeded"
          ? {
              outputs: [
                output(
                  required(data.output?.model_url, "平台模型结果地址"),
                  "model3d",
                  "tripo-model.glb",
                ),
              ],
            }
          : {}),
        ...(status === "failed"
          ? { message: "Tripo 任务失败，请在平台核查任务记录" }
          : {}),
      };
    },
  };
}
