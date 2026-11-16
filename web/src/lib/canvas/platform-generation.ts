import type { ConnectorJob, ConnectorPreset } from "@/services/api/connectors";
import type { CanvasNodeData, CanvasNodeMetadata } from "@/types/canvas";
import { validateRunningHubInputs, validateRunningHubParams } from "@/lib/connectors/runninghub-preset";

export type PlatformReference = { nodeId: string; name: string; kind: "image" | "video"; role: string; content: string; storageKey?: string; mimeType?: string };
export type PlatformResult = {
    id: string; kind: "image" | "video"; content: string; storageKey?: string; mimeType: string; bytes: number;
    naturalWidth?: number; naturalHeight?: number; durationMs?: number;
};
export type PlatformBatch = {
    requestId: string; jobId?: string; preset?: ConnectorPreset; prompt: string; references: PlatformReference[];
    status?: ConnectorJob["status"]; message?: string; outputs: PlatformResult[];
};
export type PlatformGenerationState = {
    enabled?: boolean; preset?: ConnectorPreset; inputRoles?: Record<string, string>; useCurrentImage?: boolean;
    current?: PlatformBatch; history?: PlatformBatch[];
};

export function platformPresetKind(preset: ConnectorPreset): "image" | "video" | null {
    if (preset.provider === "runninghub" && ["workflow", "app"].includes(preset.action)) {
        const kind = preset.params?.outputKind ?? "image";
        return kind === "image" || kind === "video" ? kind : null;
    }
    const actions: Record<string, Record<string, "image" | "video">> = {
        kling: { text_to_image: "image", image_to_image: "image", text_to_video: "video", image_to_video: "video" },
        jimeng: { text2image: "image", image2image: "image", text2video: "video", image2video: "video", frames2video: "video" },
    };
    return actions[preset.provider]?.[preset.action] ?? null;
}

export function validatePlatformInputs(preset: ConnectorPreset, inputs: Pick<PlatformReference, "kind" | "role">[]) {
    if (!platformPresetKind(preset)) throw new Error("此预设需要使用独立工作流节点");
    if (preset.provider === "runninghub") {
        validateRunningHubParams(preset.params || {});
        validateRunningHubInputs(preset, inputs.map(input => input.role));
        return;
    }
    if (inputs.some(input => input.kind !== "image")) throw new Error("此操作只接受图片参考");
    const action = preset.action;
    if (action.startsWith("text")) {
        if (inputs.length) throw new Error("文生任务不接受参考素材，请断开参考或选择图生预设");
        return;
    }
    if (!inputs.length) throw new Error("请连接参考图片，或勾选使用当前图片");
    if (preset.provider === "kling" && action === "image_to_video" || preset.provider === "jimeng" && action === "frames2video") {
        if (inputs.some(input => !["image", "tailImage"].includes(input.role))) throw new Error("请选择首帧或尾帧角色");
        if (!inputs.some(input => input.role === "image")) throw new Error("请指定首帧图片");
        if (new Set(inputs.map(input => input.role)).size !== inputs.length) throw new Error("首帧和尾帧各只能使用一张图片");
        if (action === "frames2video" && !inputs.some(input => input.role === "tailImage")) throw new Error("请指定尾帧图片");
    } else {
        if (inputs.some(input => input.role !== "image")) throw new Error("此操作只接受 image 角色的图片");
        if (action === "image2video" && inputs.length !== 1) throw new Error("即梦图生视频需要一张图片");
    }
}

export function beginPlatformBatch(node: CanvasNodeData, preset: ConnectorPreset, prompt: string, references: PlatformReference[], requestId: string): PlatformGenerationState {
    const state = node.metadata?.platformGeneration || {};
    if (state.current) throw new Error("已有提交记录，请先恢复原任务或开始新一轮");
    const history = [...(state.history || [])];
    const metadata = node.metadata;
    if (metadata?.content && !history.some(batch => batch.outputs.some(output => output.storageKey ? output.storageKey === metadata.storageKey : output.content === metadata.content))) {
        const kind = node.type === "video" ? "video" : "image";
        const outputs: PlatformResult[] = kind === "image" && metadata.images?.some(image => image.content)
            ? metadata.images.filter(image => image.content).map(image => ({ ...image, kind }))
            : [{ id: `${requestId}:original`, kind, content: metadata.content, storageKey: metadata.storageKey, mimeType: metadata.mimeType || (kind === "image" ? "image/png" : "video/mp4"), bytes: metadata.bytes || 0, naturalWidth: metadata.naturalWidth, naturalHeight: metadata.naturalHeight, durationMs: metadata.durationMs }];
        history.push({ requestId: `${requestId}:original`, prompt: metadata.prompt || "原有素材", references: [], outputs });
    }
    return { ...state, history, current: { requestId, preset: structuredClone(preset), prompt, references: structuredClone(references), status: "submitting", outputs: [] } };
}

export function platformResultMetadata(kind: string, outputs: PlatformResult[], id: string): CanvasNodeMetadata {
    const output = outputs.find(item => item.id === id);
    if (!output || output.kind !== kind) throw new Error("结果类型与当前节点不一致");
    return {
        content: output.content, storageKey: output.storageKey, mimeType: output.mimeType, bytes: output.bytes,
        naturalWidth: output.naturalWidth, naturalHeight: output.naturalHeight, durationMs: output.durationMs,
        status: "success", errorDetails: undefined, videoTaskId: undefined, videoTaskProvider: undefined,
        ...(kind === "image" ? { primaryImageId: id, images: outputs.filter(item => item.kind === "image").map(item => ({ ...item, status: "success" as const, naturalWidth: item.naturalWidth || 0, naturalHeight: item.naturalHeight || 0 })) } : {}),
    };
}

export function appendPlatformResult(node: CanvasNodeData, requestId: string, result: PlatformResult): CanvasNodeMetadata {
    const state = node.metadata?.platformGeneration;
    if (!state?.current || state.current.requestId !== requestId) throw new Error("请求已改变，不能覆盖当前节点");
    if (result.kind !== node.type) throw new Error("结果类型与当前节点不一致，请使用独立工作流节点");
    if (state.current.outputs.some(output => output.id === result.id)) return { platformGeneration: state };
    const outputs = [...state.current.outputs, result];
    const selected = node.metadata?.primaryImageId;
    const selection = !node.metadata?.content ? platformResultMetadata(node.type, outputs, result.id)
        : node.type === "image" && outputs.some(output => output.id === selected) ? platformResultMetadata(node.type, outputs, selected!) : {};
    return { ...selection, platformGeneration: { ...state, current: { ...state.current, outputs } } };
}

export function archivePlatformBatch(state: PlatformGenerationState): PlatformGenerationState {
    return { ...state, history: [...(state.history || []), ...(state.current ? [state.current] : [])], current: undefined };
}

export function platformNeedsRecovery(batch?: PlatformBatch) {
    return Boolean(batch && !["succeeded", "failed", "cancelled"].includes(batch.status || ""));
}

export function selectCanvasGenerator(node: CanvasNodeData, selection: { model: string } | { preset: ConnectorPreset }): CanvasNodeMetadata {
    const state = node.metadata?.platformGeneration || {};
    if (platformNeedsRecovery(state.current)) throw new Error("请先确认原任务状态，再切换模型");
    const archived = archivePlatformBatch(state);
    return "model" in selection
        ? { model: selection.model, platformGeneration: { ...archived, enabled: false } }
        : { platformGeneration: { ...archived, enabled: true, preset: structuredClone(selection.preset), inputRoles: {}, useCurrentImage: false } };
}

export function platformRoundActions(batch: Pick<PlatformBatch, "jobId" | "status"> | undefined, busy: boolean, queryStopped: boolean) {
    const active = Boolean(batch?.jobId && ["submitting", "queued", "running", "saving"].includes(batch.status || ""));
    return { canStart: !busy && (!active || queryStopped), needsConfirmation: queryStopped || Boolean(batch && !["succeeded", "failed", "cancelled"].includes(batch.status || "")) };
}
