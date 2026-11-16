import { connectorsApi, type ConnectorJob, type ConnectorOutput, type ConnectorProvider, type ConnectorSubmit } from "./connectors";
import { appendPlatformResult, beginPlatformBatch, platformPresetKind, validatePlatformInputs, type PlatformReference, type PlatformResult } from "@/lib/canvas/platform-generation";
import type { CanvasNodeData, CanvasNodeMetadata } from "@/types/canvas";

export type PlatformSession = { canvasId: string; nodeId: string; read: () => CanvasNodeData | null; write: (patch: CanvasNodeMetadata) => void; persist: () => Promise<void> };
type Dependencies = {
    upload: (blob: Blob, name: string) => Promise<{ id: string }>;
    referenceBlob: (reference: PlatformReference) => Promise<Blob>;
    submit: (body: ConnectorSubmit) => Promise<ConnectorJob>;
    jobs: () => Promise<{ jobs: ConnectorJob[] }>;
    refresh: (id: string) => Promise<ConnectorJob>;
    saveOutput: (output: ConnectorOutput) => Promise<PlatformResult>;
    recordJob: (job: ConnectorJob) => void;
};

export const platformDependencies: Dependencies = {
    ...connectorsApi,
    referenceBlob: async reference => {
        const images = await import("@/services/image-storage");
        const media = await import("@/services/file-storage");
        if (reference.storageKey) {
            const stored = await (reference.kind === "image" ? images.getImageBlob(reference.storageKey) : media.getMediaBlob(reference.storageKey));
            if (stored) return stored;
        }
        if (!reference.content) throw new Error(`参考素材「${reference.name}」无法读取`);
        const saved = reference.kind === "image" ? await images.uploadImage(reference.content) : await media.uploadMediaFile(reference.content, "video");
        const blob = saved.storageKey ? await (reference.kind === "image" ? images.getImageBlob(saved.storageKey) : media.getMediaBlob(saved.storageKey)) : null;
        if (!blob) throw new Error(`参考素材「${reference.name}」无法读取`);
        return blob;
    },
    saveOutput: async output => {
        if (output.kind !== "image" && output.kind !== "video") throw new Error("此结果需要使用独立工作流节点");
        const blob = await connectorsApi.outputBlob(output);
        if (output.kind === "image") {
            const { uploadImage } = await import("@/services/image-storage");
            const image = await uploadImage(blob);
            return { id: output.id, kind: "image", content: image.url, storageKey: image.storageKey, naturalWidth: image.width, naturalHeight: image.height, bytes: image.bytes, mimeType: image.mimeType };
        }
        const { uploadMediaFile } = await import("@/services/file-storage");
        const video = await uploadMediaFile(blob, "video");
        return { id: output.id, kind: "video", content: video.url, storageKey: video.storageKey, naturalWidth: video.width, naturalHeight: video.height, bytes: video.bytes, mimeType: video.mimeType, durationMs: video.durationMs };
    },
    recordJob: () => {},
};

export async function resolvePlatformResult(output: PlatformResult): Promise<PlatformResult> {
    const { resolveImageUrl } = await import("@/services/image-storage");
    const { resolveMediaUrl } = await import("@/services/file-storage");
    const content = await (output.kind === "image" ? resolveImageUrl(output.storageKey, output.content) : resolveMediaUrl(output.storageKey, output.content));
    return { ...output, content };
}

function matches(session: PlatformSession, requestId: string) {
    const node = session.read();
    return node?.metadata?.platformGeneration?.current?.requestId === requestId ? node : null;
}

export async function receivePlatformJob(session: PlatformSession, job: ConnectorJob, deps = platformDependencies) {
    if (!session.read()) return;
    if (job.canvasId !== session.canvasId || job.nodeId !== session.nodeId) throw new Error("任务属于其他画布或节点，不能在此恢复");
    let node = matches(session, job.requestId);
    if (!node) throw new Error("请求已改变，请在原批次查看此任务");
    deps.recordJob(job);
    const state = node.metadata!.platformGeneration!;
    const missingOutputs = job.outputs.some(output => !state.current!.outputs.some(item => item.id === output.id));
    session.write({ platformGeneration: { ...state, current: { ...state.current!, jobId: job.id, status: job.status === "succeeded" && missingOutputs ? "saving" : job.status, message: job.message } } });
    await session.persist();
    // Each imported result is persisted separately, including partially saved remote tasks.
    try {
        for (const output of job.outputs) {
            node = matches(session, job.requestId);
            if (!node) return;
            if (node.metadata!.platformGeneration!.current!.outputs.some(item => item.id === output.id)) continue;
            if (output.kind !== node.type) throw new Error("工作流返回了其他类型的结果，请在平台任务列表查看，并改用独立工作流节点");
            const saved = await deps.saveOutput(output);
            node = matches(session, job.requestId);
            if (!node) return;
            session.write(appendPlatformResult(node, job.requestId, saved));
            await session.persist();
        }
        const current = matches(session, job.requestId)?.metadata?.platformGeneration;
        if (current) {
            session.write({ platformGeneration: { ...current, current: { ...current.current!, status: job.status } } });
            await session.persist();
        }
    } catch (error) {
        const current = matches(session, job.requestId)?.metadata?.platformGeneration;
        if (current) {
            session.write({ platformGeneration: { ...current, current: { ...current.current!, status: "save_failed", message: error instanceof Error ? error.message : "本地结果保存失败" } } });
            await session.persist();
        }
        throw error;
    }
}

export async function submitPlatformNode(session: PlatformSession, provider: ConnectorProvider | undefined, prompt: string, references: PlatformReference[], deps = platformDependencies) {
    const node = session.read();
    if (!node) return;
    const state = node.metadata?.platformGeneration;
    if (state?.current) throw new Error("已有提交记录，请先恢复原任务或开始新一轮");
    const preset = state?.preset;
    if (!preset || platformPresetKind(preset) !== node.type) throw new Error("请选择适合当前节点的预设");
    const action = provider?.actions.find(item => item.id === preset.action);
    if (provider?.id !== preset.provider || !["configured", "ready"].includes(provider.state) || !action) throw new Error("请先在平台设置完成连接检查");
    if ((action.requiresModel && !preset.model?.trim()) || (action.requiresRemoteId && !preset.remoteId?.trim())) throw new Error("预设缺少实际模型或工作流 ID，请编辑预设");
    validatePlatformInputs(preset, references);
    if (preset.provider === "runninghub" && !preset.params?.promptTarget && prompt.trim()) throw new Error("此工作流未配置提示词接收位置，请先在平台设置编辑预设，或清空提示词使用工作流内置内容");
    const snapshot = beginPlatformBatch(node, preset, prompt, references, crypto.randomUUID());
    const inputs = [];
    for (const reference of snapshot.current!.references) {
        const blob = await deps.referenceBlob(reference);
        if (!session.read()) return;
        const extensions: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif", "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov" };
        const extension = extensions[blob.type.split(";")[0]];
        const file = await deps.upload(blob, `${reference.name.replace(/\.[^.]+$/, "")}${extension ? `.${extension}` : ""}`);
        inputs.push({ fileId: file.id, role: reference.role });
    }
    const latest = session.read();
    if (!latest) return;
    if (latest.metadata?.platformGeneration?.current || JSON.stringify(latest.metadata?.platformGeneration?.preset) !== JSON.stringify(preset)) throw new Error("节点预设已改变，请重新检查后生成");
    session.write({ platformGeneration: snapshot });
    await session.persist();
    const batch = snapshot.current!;
    if (!matches(session, batch.requestId)) return;
    // Preserve requestId before the paid submission. A lost response is queried, never resubmitted.
    await receivePlatformJob(session, await deps.submit({ requestId: batch.requestId, provider: preset.provider, preset: batch.preset!, prompt: batch.prompt, inputs, canvasId: session.canvasId, nodeId: session.nodeId }), deps);
}

export async function refreshPlatformNode(session: PlatformSession, deps = platformDependencies) {
    const batch = session.read()?.metadata?.platformGeneration?.current;
    if (!batch) return;
    let id = batch.jobId;
    if (!id) {
        const job = (await deps.jobs()).jobs.find(item => item.requestId === batch.requestId);
        if (!session.read()) return;
        if (!job) throw new Error("未找到原请求，请先在平台核查是否已提交；不会自动重新生成");
        await receivePlatformJob(session, job, deps);
        id = job.id;
    }
    if (!matches(session, batch.requestId)) return;
    await receivePlatformJob(session, await deps.refresh(id), deps);
}
