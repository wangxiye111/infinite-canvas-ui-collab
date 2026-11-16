import { createHmac, randomUUID } from "node:crypto";
import { extname } from "node:path";
import {
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
  setPath,
  state,
  validateInputs,
} from "./shared.mjs";

const base = "https://openapi.liblibai.cloud";
export function signedUrl(
  config,
  path,
  timestamp = String(Date.now()),
  nonce = randomUUID(),
) {
  credentials(config, ["accessKey", "secretKey"]);
  const signature = createHmac("sha1", config.secretKey)
    .update(`${path}&${timestamp}&${nonce}`)
    .digest("base64url");
  return `${base}${path}?${new URLSearchParams({ AccessKey: config.accessKey, Signature: signature, Timestamp: timestamp, SignatureNonce: nonce })}`;
}
export default function liblib(ctx) {
  const post = (config, path, body) =>
    request(ctx, signedUrl(config, path), json(body));
  return {
    id: "liblib",
    name: "Liblib.art",
    auth: "api",
    docs: "https://www.liblib.art/apis",
    billing: "API 会员和积分独立于网页会员；仅可调用已开放 API 参数的工作流",
    fields: [
      { key: "accessKey", label: "Access Key", secret: true },
      { key: "secretKey", label: "Secret Key", secret: true },
    ],
    actions: [
      {
        id: "workflow",
        label: "ComfyUI 应用",
        output: "image",
        requiresRemoteId: true,
      },
    ],
    async status(config) {
      return configured(config, ["accessKey", "secretKey"]);
    },
    async check(config) {
      credentials(config, ["accessKey", "secretKey"]);
      return {
        state: "configured",
        message:
          "凭据已保存；尚未确认官方只读账户检查接口，不能据此声称账户已连接或有可用额度",
      };
    },
    async submit(config, job) {
      credentials(config, ["accessKey", "secretKey"]);
      if (job.preset.action !== "workflow")
        throw new Error("不支持此 Liblib 操作");
      const p = params(job, [
        "generateParams",
        "promptPath",
        "inputTargets",
        "outputKind",
      ]);
      if (
        !p.generateParams ||
        typeof p.generateParams !== "object" ||
        Array.isArray(p.generateParams)
      )
        throw new Error("请填写平台工作流提供的 generateParams");
      const templateUuid = required(job.preset.remoteId, "templateUuid");
      const generateParams = structuredClone(p.generateParams);
      validateInputs(job, p.inputTargets);
      if (job.prompt && !p.promptPath)
        throw new Error("请先配置 promptPath 提示词字段映射");
      if (p.promptPath) setPath(generateParams, p.promptPath, job.prompt || "");
      // Validate mappings before uploading any asset.
      for (const target of p.inputTargets ?? [])
        setPath(generateParams, target.path, "");
      for (const target of p.inputTargets ?? []) {
        const { file, blob } = await filePart(ctx, inputFor(job, target.role));
        const extension = extname(file.name).slice(1).toLowerCase();
        if (
          !["png", "jpg", "jpeg"].includes(extension) ||
          !["image/png", "image/jpeg"].includes(file.mimeType)
        )
          throw new Error("Liblib 官方上传当前仅支持 PNG/JPEG 图片");
        const result = await post(config, "/api/generate/upload/signature", {
          name: file.name,
          extension,
        });
        const signed = result.data;
        const postUrl = new URL(required(signed?.postUrl, "上传地址"));
        if (
          postUrl.protocol !== "https:" ||
          postUrl.username ||
          postUrl.password
        )
          throw new Error("平台返回的上传地址不受支持");
        const form = new FormData();
        for (const [field, key] of [
          ["key", "key"],
          ["policy", "policy"],
          ["x-oss-date", "xOssDate"],
          ["x-oss-expires", "xOssExpires"],
          ["x-oss-signature", "xOssSignature"],
          ["x-oss-credential", "xOssCredential"],
          ["x-oss-signature-version", "xOssSignatureVersion"],
        ]) {
          if (signed[key] === undefined)
            throw new Error("Liblib 上传签名字段不完整，未提交生成");
          form.set(field, String(signed[key]));
        }
        form.set("file", blob, file.name);
        let uploaded;
        try {
          uploaded = await ctx.fetch(postUrl.href, {
            method: "POST",
            body: form,
            redirect: "error",
          });
        } catch {
          throw new Error("Liblib 文件上传失败，未提交生成");
        }
        if (!uploaded.ok)
          throw new Error(
            `Liblib 文件上传失败（HTTP ${uploaded.status}），未提交生成`,
          );
        setPath(generateParams, target.path, new URL(signed.key, postUrl).href);
      }
      const result = await post(config, "/api/generate/comfyui/app", {
        templateUuid,
        generateParams,
      });
      return {
        remoteId: required(result.data?.generateUuid, "平台任务 ID"),
        status: "queued",
      };
    },
    async query(config, job) {
      const { data } = await post(config, "/api/generate/comfy/status", {
        generateUuid: remoteId(job),
      });
      const status = state(data?.generateStatus, {
        1: "queued",
        2: "running",
        3: "running",
        4: "running",
        5: "succeeded",
        6: "failed",
        7: "failed",
      });
      const outputs =
        status === "succeeded"
          ? nonempty([
              ...(data.images ?? [])
                .filter((item) => item.auditStatus === 3)
                .map((item) => output(item.imageUrl, "image")),
              ...(data.videos ?? [])
                .filter((item) => item.auditStatus === 3)
                .map((item) => output(item.videoUrl, "video")),
            ])
          : undefined;
      return {
        status,
        progress: progress(data.percentCompleted, 100),
        ...(outputs ? { outputs } : {}),
        ...(status === "failed"
          ? { message: "Liblib 任务失败，请在平台核查任务记录" }
          : {}),
      };
    },
  };
}
