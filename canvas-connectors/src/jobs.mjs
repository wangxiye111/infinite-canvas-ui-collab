import { createHash, randomUUID } from "node:crypto";
import { basename } from "node:path";
import { secretKey, mimeForName } from "./store.mjs";

const terminal = new Set(["succeeded", "failed", "cancelled"]);
const statuses = new Set([
  "submitting",
  "queued",
  "running",
  "succeeded",
  "failed",
  "interrupted",
  "cancelled",
  "saving",
  "save_failed",
  "query_failed",
]);
const bad = (message) => Object.assign(new Error(message), { status: 400 });
function hasCredential(value) {
  return (
    value &&
    typeof value === "object" &&
    Object.entries(value).some(
      ([key, item]) => secretKey.test(key) || hasCredential(item),
    )
  );
}

export function createJobs(
  store,
  providers,
  { fetch: fetcher = globalThis.fetch } = {},
) {
  const active = new Map();
  const submissions = new Map();
  for (const job of Object.values(store.jobs)) {
    if (job.status === "submitting") {
      job.status = job.remoteId ? "queued" : "interrupted";
      job.message = job.remoteId
        ? "可继续查询原任务"
        : "上次提交中断，状态未确认；请先核对平台记录，系统没有自动重投。";
    }
    if (job.status === "saving") {
      job.status = "save_failed";
      job.message = "上次保存结果中断，已下载文件仍保留；请恢复原任务的结果保存。";
    }
  }
  store.saveJobs();
  const update = (job, patch) => {
    Object.assign(job, patch, { updatedAt: new Date().toISOString() });
    store.saveJobs();
    return job;
  };
  const get = (id) => {
    if (typeof id !== "string" || !Object.hasOwn(store.jobs, id))
      throw Object.assign(new Error("任务不存在"), { status: 404 });
    return store.jobs[id];
  };
  const providerFor = (job) => {
    const p = providers.find((p) => p.id === job.provider);
    if (!p) throw bad("不支持的平台");
    return p;
  };
  const once = (id, fn) => {
    if (active.has(id)) return active.get(id);
    const task = Promise.resolve()
      .then(fn)
      .finally(() => active.delete(id));
    active.set(id, task);
    return task;
  };
  const saveOutput = async (job, output) => {
    let file;
    if (output.path) {
      file = await store.importCliFile(output.path, job.id, output);
    } else if (
      typeof output.url === "string" &&
      output.url.startsWith("/api/connectors/files/")
    ) {
      file = store.getFile(output.url.split("/").pop());
    } else {
      const url = new URL(output.url);
      const host = url.hostname.toLowerCase();
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        host === "localhost" ||
        host.endsWith(".localhost") ||
        host === "[::1]" ||
        /^(?:127\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(
          host,
        )
      )
        throw new Error("平台返回了不允许下载的资源地址");
      const response = await fetcher(url.href, {
        headers: output.headers,
        redirect: "error",
      });
      if (!response.ok || !response.body)
        throw new Error(
          `保存平台资源失败（HTTP ${response.status}），可刷新原任务重试保存`,
        );
      const mimeType =
        output.mimeType ||
        response.headers.get("content-type")?.split(";")[0] ||
        mimeForName(url.pathname);
      if (mimeType === "text/html")
        throw new Error("平台返回网页而不是媒体文件");
      file = await store.saveFile(response.body, {
        name: output.name || basename(url.pathname) || "result",
        mimeType,
      });
    }
    const kind =
      output.kind ||
      (file.mimeType.startsWith("image/")
        ? "image"
        : file.mimeType.startsWith("video/")
          ? "video"
          : file.mimeType.startsWith("audio/")
            ? "audio"
            : file.mimeType === "text/plain"
              ? "text"
              : "model3d");
    return {
      id: file.id,
      url: `/api/connectors/files/${file.id}`,
      name: file.name,
      mimeType: file.mimeType,
      kind,
    };
  };
  const apply = async (job, result) => {
    if (!result || typeof result !== "object")
      throw new Error("平台未返回有效任务状态");
    const patch = {};
    for (const field of ["remoteId", "remoteContext", "progress", "message"])
      if (result[field] !== undefined) patch[field] = result[field];
    if (result.status && statuses.has(result.status))
      patch.status = result.status === "succeeded" ? "saving" : result.status;
    if (result.remoteId) patch.remoteId = String(result.remoteId);
    update(job, patch);
    if (result.outputs?.length) {
      update(job, { status: "saving", message: "平台结果已返回，正在保存到本机" });
      const outputs = [];
      for (const output of result.outputs) {
        const source = createHash("sha256").update(JSON.stringify([output.id || output.path || output.url, output.kind])).digest("hex");
        let saved = job.outputs.find(item => item.id === job.outputSources?.[source]);
        if (!saved) {
          saved = await saveOutput(job, output);
          update(job, { outputs: [...job.outputs, saved], outputSources: { ...job.outputSources, [source]: saved.id } });
        }
        if (!outputs.some(item => item.id === saved.id)) outputs.push(saved);
      }
      update(job, {
        outputs,
        status: "succeeded",
        message: result.message || "结果已保存到本机",
      });
    } else if (result.status === "succeeded" && !job.outputs.length) {
      throw new Error("平台显示完成但未返回可保存的结果，请刷新原任务核查");
    }
    return job;
  };
  return {
    get,
    list: () =>
      Object.values(store.jobs).sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      ),
    create(input) {
      if (
        !input ||
        typeof input.requestId !== "string" ||
        !input.requestId.trim()
      )
        throw bad("缺少请求标识");
      const existing = Object.values(store.jobs).find(
        (job) => job.requestId === input.requestId,
      );
      if (existing) return existing;
      const provider = providers.find((p) => p.id === input.provider);
      if (!provider) throw bad("请选择已支持的平台");
      const preset = input.preset;
      if (
        !preset ||
        preset.provider !== provider.id ||
        !provider.actions.some((action) => action.id === preset.action)
      )
        throw bad("平台预设或动作无效");
      if (hasCredential(preset))
        throw bad("任务预设不能包含密钥，请在平台连接中保存凭据");
      if (
        !Array.isArray(input.inputs) ||
        input.inputs.some((file) => !file || typeof file.fileId !== "string")
      )
        throw bad("无效的输入素材");
      input.inputs.forEach((file) => store.getFile(file.fileId));
      const now = new Date().toISOString();
      const job = {
        id: randomUUID(),
        requestId: input.requestId,
        provider: provider.id,
        preset: structuredClone(preset),
        prompt: String(input.prompt || ""),
        inputs: input.inputs.map((x) => ({
          fileId: x.fileId,
          ...(x.role ? { role: String(x.role) } : {}),
        })),
        ...(input.canvasId ? { canvasId: String(input.canvasId) } : {}),
        ...(input.nodeId ? { nodeId: String(input.nodeId) } : {}),
        status: "submitting",
        outputs: [],
        createdAt: now,
        updatedAt: now,
      };
      store.jobs[job.id] = job;
      store.saveJobs();
      const controller = provider.abortableSubmit ? new AbortController() : undefined;
      if (controller) submissions.set(job.id, controller);
      void once(job.id, async () => {
        try {
          const result = await provider.submit(
            store.configs[provider.id] || {},
            job,
            { signal: controller?.signal },
          );
          if (!result?.remoteId && !result?.outputs?.length)
            throw new Error("没有取得平台任务ID，提交状态未确认");
          return await apply(job, {
            status: result.outputs?.length ? "succeeded" : "queued",
            ...result,
          });
        } catch (error) {
          const saving = job.status === "saving" || error.code === "RESULT_SAVE_FAILED";
          if (!saving && error.code === "KLING_INPUT_REJECTED")
            return update(job, { status: "failed", message: error.message });
          return update(job, {
            status: saving ? "save_failed" : "interrupted",
            message: store.public(
              saving ? `${error.message}。请恢复原任务的结果保存，不必重新生成。` : `${error.message}。没有自动重投；请核对平台任务后再决定。`,
            ),
          });
        } finally { submissions.delete(job.id); }
      });
      return job;
    },
    async refresh(id) {
      const job = get(id);
      if (terminal.has(job.status)) return job;
      return once(id, async () => {
        if (!job.remoteId && !providerFor(job).queryWithoutRemoteId) {
          if (job.status !== "submitting" && !job.message)
            update(job, {
              message: "缺少已确认的平台任务ID，无法查询；请先核对平台记录。",
            });
          return job;
        }
        let applying = false;
        try {
          const result = await providerFor(job).query(store.configs[job.provider] || {}, job);
          applying = true;
          return await apply(job, result);
        } catch (error) {
          if (error.code === "CLI_RUN_NOT_FOUND" && job.status === "interrupted" && !job.remoteId && job.message) return job;
          return update(job, {
            status: (applying && job.status === "saving") || error.code === "RESULT_SAVE_FAILED" ? "save_failed" : "query_failed",
            message: store.public(error.message),
          });
        }
      });
    },
    async cancel(id) {
      const job = get(id),
        provider = providerFor(job);
      if (["saving", "save_failed"].includes(job.status)) return job;
      if (!provider.cancel) throw bad("该平台未提供已验证的服务端取消能力");
      // Stop a cancellable preflight before waiting, so cancellation cannot start a new request.
      submissions.get(id)?.abort();
      // A cancellation must not be swallowed by a concurrent read-only refresh.
      if (active.has(id)) await active.get(id);
      if (terminal.has(job.status) || ["saving", "save_failed"].includes(job.status)) return job;
      return once(id, async () =>
        apply(
          job,
          await provider.cancel(store.configs[job.provider] || {}, job),
        ),
      );
    },
    async waitForIdle() {
      await Promise.allSettled([...active.values()]);
    },
  };
}
