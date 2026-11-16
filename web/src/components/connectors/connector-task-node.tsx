import { App, Button, Input, Progress, Select, Tag } from "antd";
import { Play, RefreshCw, Settings2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";

import { getNodeDefinition } from "@/lib/canvas/node-registry";
import { imageMetadata, audioMetadata, videoMetadata } from "@/lib/canvas/canvas-node-factory";
import { fitNodeSize } from "@/lib/canvas/canvas-node-size";
import { importGLB } from "@/lib/connectors/model3d";
import { runningHubInputRoles, validateRunningHubInputs } from "@/lib/connectors/runninghub-preset";
import { getImageBlob, resolveImageUrl, uploadImage } from "@/services/image-storage";
import { getMediaBlob, resolveMediaUrl, uploadMediaFile } from "@/services/file-storage";
import { connectorsApi, connectorJobLabels, connectorProviderNames, connectorStateLabels, isActiveConnectorJob, canCancelConnectorJob, CONNECTOR_POLL_INTERVAL_MS, type ConnectorInput, type ConnectorJob, type ConnectorPreset } from "@/services/api/connectors";
import { useConnectorManagerStore, useConnectorsStore } from "@/stores/use-connectors-store";
import type { CanvasNodeData, CanvasNodeMetadata } from "@/types/canvas";
import type { CanvasAgentOp } from "@/lib/canvas/canvas-agent-ops";
import type { CanvasNodeContext } from "@/types/canvas-plugin";

export type ConnectorNodeState = { preset?: ConnectorPreset; jobId?: string; requestId?: string; importedOutputIds?: string[]; prompt?: string; inputRoles?: Record<string, string> };
type TaskMetadata = CanvasNodeMetadata & { connector?: ConnectorNodeState };
const importing = new Set<string>();

const mediaExtensions: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif", "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov" };
function uploadFileName(name: string, blob: Blob) {
    const extension = mediaExtensions[blob.type.split(";")[0].toLowerCase()];
    return extension ? `${name.replace(/\.(png|jpe?g|webp|gif|avif|mp4|webm|mov)$/i, "")}.${extension}` : name;
}
function upstreamResource(node: CanvasNodeData) {
    return getNodeDefinition(node.type)?.resource?.(node) || null;
}
async function upstreamBlob(node: CanvasNodeData, kind: "image" | "video", fallback: string) {
    const key = node.metadata?.storageKey;
    if (key) {
        const blob = await (kind === "image" ? getImageBlob(key) : getMediaBlob(key));
        if (blob) return blob;
    }
    const url = await (kind === "image" ? resolveImageUrl(key, fallback) : resolveMediaUrl(key, fallback));
    if (!url) throw new Error(`上游素材「${node.title}」没有可读取的文件`);
    // Existing storage helpers resolve local blobs as well as user-provided media URLs.
    if (kind === "image") {
        const stored = await uploadImage(url);
        const blob = stored.storageKey ? await getImageBlob(stored.storageKey) : null;
        if (blob) return blob;
    } else {
        const stored = await uploadMediaFile(url);
        const blob = await getMediaBlob(stored.storageKey);
        if (blob) return blob;
    }
    throw new Error(`上游素材「${node.title}」读取失败`);
}

export function ConnectorTaskNode({ ctx }: { ctx: CanvasNodeContext }) {
    const { id: canvasId } = useParams<{ id: string }>();
    const { modal } = App.useApp();
    const state = (ctx.node.metadata as TaskMetadata | undefined)?.connector || {};
    const providers = useConnectorsStore((store) => store.providers);
    const presets = useConnectorsStore((store) => store.presets);
    const jobs = useConnectorsStore((store) => store.jobs);
    const serviceError = useConnectorsStore((store) => store.error);
    const load = useConnectorsStore((store) => store.load);
    const setJob = useConnectorsStore((store) => store.setJob);
    const openManager = useConnectorManagerStore((store) => store.openManager);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [pollStopped, setPollStopped] = useState(false);
    const mounted = useRef(false);
    const current = useRef(ctx);
    const currentCanvas = useRef(canvasId);
    current.current = ctx;
    currentCanvas.current = canvasId;
    const inCurrentCanvas = () => mounted.current && currentCanvas.current === canvasId && current.current.node.id === ctx.node.id;
    const lock = useRef(false);
    const job = jobs.find((item) => item.id === state.jobId);
    const provider = providers.find((item) => item.id === state.preset?.provider);
    const active = Boolean(job && isActiveConnectorJob(job));
    const action = provider?.actions.find((item) => item.id === (job?.preset.action || state.preset?.action));
    const canSubmit = Boolean(provider && ["configured", "ready"].includes(provider.state) && action && (!action.requiresModel || state.preset?.model?.trim()) && (!action.requiresRemoteId || state.preset?.remoteId?.trim()));
    const upstream = ctx.getUpstream().filter((node) => ["text", "image", "video"].includes(upstreamResource(node)?.kind || ""));
    const mediaInputs = upstream.filter((node) => ["image", "video"].includes(upstreamResource(node)?.kind || ""));
    let workflowRoles: string[] = [];
    let mappingError = "";
    try { workflowRoles = runningHubInputRoles(state.preset); }
    catch (error) { mappingError = error instanceof Error ? error.message : "工作流输入配置无效"; }
    const patch = (change: Partial<ConnectorNodeState>) => {
        const latest = current.current.getNode(ctx.node.id);
        if (!inCurrentCanvas() || !latest) return;
        const connector = (latest.metadata as TaskMetadata | undefined)?.connector || {};
        current.current.updateMetadata({ connector: { ...connector, ...change } } as TaskMetadata);
    };
    const sameJob = (value: ConnectorJob) => (!value.nodeId || value.nodeId === ctx.node.id) && (!value.canvasId || value.canvasId === canvasId);

    const importOutputs = async (value: ConnectorJob) => {
        if (value.status !== "succeeded" || !sameJob(value)) return;
        const key = `${canvasId}:${ctx.node.id}`;
        if (importing.has(key)) return;
        importing.add(key);
        try {
            for (const [index, output] of value.outputs.entries()) {
                const latest = current.current.getNode(ctx.node.id);
                if (!inCurrentCanvas() || !latest) return;
                const connector = (latest.metadata as TaskMetadata | undefined)?.connector || {};
                if (connector.jobId !== value.id || connector.importedOutputIds?.includes(output.id)) continue;
                const id = `connector-output:${ctx.node.id}:${value.id}:${output.id}`;
                if (current.current.getNode(id)) {
                    current.current.applyOps([{ type: "update_node", id: latest.id, metadata: { connector: { ...connector, importedOutputIds: [...(connector.importedOutputIds || []), output.id] } } as TaskMetadata }]);
                    continue;
                }
                const blob = await connectorsApi.outputBlob(output);
                let metadata: CanvasNodeMetadata;
                let size = { width: 360, height: output.kind === "audio" ? 160 : 280 };
                if (output.kind === "image") {
                    const image = await uploadImage(blob);
                    metadata = imageMetadata(image);
                    size = fitNodeSize(image.width, image.height, 420, 360);
                } else if (output.kind === "model3d") {
                    const name = /\.glb$/i.test(output.name) ? output.name : `${output.name || "model"}.glb`;
                    metadata = { ...(await importGLB(new File([blob], name, { type: "model/gltf-binary" }))), status: "success" };
                } else {
                    const media = await uploadMediaFile(blob, output.kind);
                    metadata = output.kind === "video" ? videoMetadata(media) : audioMetadata(media);
                    if (output.kind === "video" && media.width && media.height) size = fitNodeSize(media.width, media.height, 420, 360);
                }
                const node = current.current.getNode(ctx.node.id);
                if (!inCurrentCanvas() || !node) return;
                const latestState = (node.metadata as TaskMetadata | undefined)?.connector || {};
                if (latestState.jobId !== value.id) return;
                const ops: CanvasAgentOp[] = [];
                if (!current.current.getNode(id))
                    ops.push(
                        {
                            type: "add_node",
                            id,
                            nodeType: output.kind === "model3d" ? "connectors:model3d" : output.kind,
                            title: output.name || `${value.preset.name} ${index + 1}`,
                            x: node.position.x + node.width + 100,
                            y: node.position.y + index * 80,
                            ...size,
                            metadata,
                        },
                        { type: "connect_nodes", fromNodeId: node.id, toNodeId: id },
                    );
                ops.push({ type: "update_node", id: node.id, metadata: { connector: { ...latestState, importedOutputIds: [...new Set([...(latestState.importedOutputIds || []), output.id])] } } as TaskMetadata });
                current.current.applyOps(ops);
            }
        } finally {
            importing.delete(key);
        }
    };
    const receive = async (value: ConnectorJob) => {
        setJob(value);
        if (!inCurrentCanvas()) return;
        if (!sameJob(value)) throw new Error("这个任务属于其他画布或节点，请在原节点恢复；新节点可先重置任务。");
        const node = current.current.getNode(ctx.node.id);
        if (!node) return;
        const connector = (node.metadata as TaskMetadata | undefined)?.connector || {};
        current.current.applyOps([{ type: "update_node", id: node.id, metadata: { connector: { ...connector, jobId: value.id, requestId: value.requestId } } as TaskMetadata }]);
        await importOutputs(value);
    };
    const run = async (task: () => Promise<void>, resumePolling = true) => {
        if (lock.current) return;
        lock.current = true;
        setBusy(true);
        setError("");
        if (resumePolling) setPollStopped(false);
        try {
            await task();
        } catch (err) {
            if (inCurrentCanvas()) {
                setError(err instanceof Error ? err.message : "平台任务操作失败");
                setPollStopped(true);
            }
        } finally {
            lock.current = false;
            if (inCurrentCanvas()) setBusy(false);
        }
    };
    const refresh = () =>
        run(async () => {
            const latestState = (current.current.getNode(ctx.node.id)?.metadata as TaskMetadata | undefined)?.connector;
            if (latestState?.jobId) await receive(await connectorsApi.refresh(latestState.jobId));
            else if (latestState?.requestId) {
                const result = await connectorsApi.jobs();
                const recovered = result.jobs.find((item) => item.requestId === latestState.requestId);
                if (!recovered) throw new Error("本地服务中未找到此请求。请先在平台核查是否已提交，再决定是否重置；不会自动重投。");
                await receive(recovered);
            }
        });
    const submit = () =>
        run(async () => {
            const latestState = (current.current.getNode(ctx.node.id)?.metadata as TaskMetadata | undefined)?.connector || {};
            if (latestState.jobId || latestState.requestId) throw new Error("已有提交记录，请先查询原任务。");
            const preset = latestState.preset;
            if (!preset) throw new Error("请先选择任务预设。");
            const connected = useConnectorsStore.getState().providers.find((item) => item.id === preset.provider);
            if (!connected || !["configured", "ready"].includes(connected.state)) throw new Error("请先在平台设置中完成凭据配置或 CLI 连接检查。");
            const selectedAction = connected.actions.find((item) => item.id === preset.action);
            if (!selectedAction || (selectedAction.requiresModel && !preset.model?.trim()) || (selectedAction.requiresRemoteId && !preset.remoteId?.trim())) throw new Error("预设缺少实际模型或工作流 ID，请编辑预设。");
            const sourceNodes = current.current.getUpstream();
            validateRunningHubInputs(preset, sourceNodes.filter(node => ["image", "video"].includes(upstreamResource(node)?.kind || "")).map(node => latestState.inputRoles?.[node.id]?.trim() || upstreamResource(node)!.kind));
            const inputs: ConnectorInput[] = [];
            const texts = [latestState.prompt || ""];
            for (const node of sourceNodes) {
                const resource = upstreamResource(node);
                if (resource?.kind === "text") {
                    if (resource.text) texts.push(resource.text);
                }
                if (resource?.kind === "image" || resource?.kind === "video") {
                    const blob = await upstreamBlob(node, resource.kind, resource.url || "");
                    const file = await connectorsApi.upload(blob, uploadFileName(node.title || `${resource.kind}-input`, blob));
                    inputs.push({ fileId: file.id, role: latestState.inputRoles?.[node.id]?.trim() || resource.kind });
                }
            }
            if (!inCurrentCanvas() || !current.current.getNode(ctx.node.id)) return;
            const requestId = crypto.randomUUID();
            current.current.applyOps([{ type: "update_node", id: ctx.node.id, metadata: { connector: { ...latestState, requestId, preset, importedOutputIds: [] } } as TaskMetadata }]);
            // A lost HTTP response is recovered by requestId; no automatic resubmission is permitted.
            await receive(await connectorsApi.submit({ requestId, provider: preset.provider, preset, prompt: texts.filter(Boolean).join("\n\n"), inputs, canvasId, nodeId: ctx.node.id }));
        });
    const reset = () => {
        const clear = () => {
            patch({ jobId: undefined, requestId: undefined, importedOutputIds: [] });
            setError("");
            setPollStopped(false);
        };
        if (active || (state.requestId && (!job || ["interrupted", "query_failed", "save_failed"].includes(job.status))))
            modal.confirm({ title: "确认平台上的原任务状态", content: "重置只解除本节点关联，不能取消远端任务。请先在平台核查是否仍在运行或已计费；之后再次生成会创建新任务。", okText: "已核查，重置", cancelText: "保留原任务", onOk: clear });
        else clear();
    };

    useEffect(() => {
        mounted.current = true;
        void load();
        return () => {
            mounted.current = false;
        };
    }, [load]);
    useEffect(() => {
        if (!state.jobId) return;
        let cancelled = false;
        void connectorsApi
            .job(state.jobId)
            .then(async (value) => {
                if (!cancelled) await receive(value);
            })
            .catch((err: unknown) => {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : "任务读取失败");
                    setPollStopped(true);
                }
            });
        return () => {
            cancelled = true;
        };
        // Job loading is tied to its persisted ID; graph changes must not query it again.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state.jobId, canvasId]);
    useEffect(() => {
        if (job?.status !== "succeeded" || !job.outputs.some((output) => !state.importedOutputIds?.includes(output.id))) return;
        void run(() => importOutputs(job), false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [job?.id, job?.status, state.importedOutputIds?.length]);
    useEffect(() => {
        if (!active || pollStopped || busy) return;
        const timer = window.setTimeout(() => {
            void refresh();
        }, CONNECTOR_POLL_INTERVAL_MS);
        return () => window.clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active, job?.updatedAt, pollStopped, busy]);

    const hasSubmission = Boolean(state.jobId || state.requestId);
    const savedPreset = presets.find((preset) => preset.id === state.preset?.id);
    const snapshotChanged = savedPreset && JSON.stringify(savedPreset) !== JSON.stringify(state.preset);
    const presetOptions = presets.map((preset) => ({
        value: preset.id,
        label: `${connectorProviderNames[preset.provider]} · ${preset.id === state.preset?.id ? state.preset?.name || preset.name : preset.name}${preset.id === state.preset?.id && snapshotChanged ? "（节点快照）" : ""}`,
    }));
    if (state.preset && !presets.some((preset) => preset.id === state.preset!.id)) presetOptions.push({ value: state.preset.id, label: `${state.preset.name}（节点快照）` });
    return (
        <div
            className="flex h-full flex-col gap-3 overflow-auto p-4 text-xs"
            style={{ color: ctx.theme.node.text }}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onWheel={(event) => event.stopPropagation()}
        >
            <div className="flex items-center justify-between gap-2">
                <span style={{ color: ctx.theme.node.muted }}>{state.preset?.provider === "runninghub" ? `RunningHub 工作流 · ${state.preset.name}` : state.preset ? connectorProviderNames[state.preset.provider] : "选择平台任务预设"}</span>
                <Button type="text" size="small" icon={<Settings2 className="size-3.5" />} onClick={openManager}>
                    平台设置
                </Button>
            </div>
            <Select
                size="small"
                placeholder="选择已保存的预设"
                disabled={hasSubmission || busy}
                value={state.preset?.id}
                options={presetOptions}
                onChange={(id) => {
                    const preset = presets.find((item) => item.id === id);
                    if (preset) patch({ preset: structuredClone(preset) });
                }}
            />
            {snapshotChanged && !hasSubmission && (
                <Button type="text" size="small" disabled={busy} onClick={() => patch({ preset: structuredClone(savedPreset) })}>
                    更新为已保存的预设
                </Button>
            )}
            {provider && (
                <span style={{ color: ctx.theme.node.muted }}>
                    {connectorStateLabels[provider.state]}
                    {state.preset?.model ? ` · ${state.preset.model}` : ""}
                </span>
            )}
            {provider?.state === "configured" && <span style={{ color: ctx.theme.node.muted }}>凭据已配置，尚未验证额度；点击生成将尝试提交任务。</span>}
            {provider?.billing && <span style={{ color: ctx.theme.node.muted }}>{provider.billing}</span>}
            <Input.TextArea size="small" rows={3} placeholder="补充提示词，也可连接上游文本节点" value={state.prompt || ""} disabled={hasSubmission || busy} onChange={(event) => patch({ prompt: event.target.value })} />
            <span style={{ color: ctx.theme.node.muted }}>
                已连接 {upstream.filter((node) => upstreamResource(node)?.kind === "text").length} 段文本、{mediaInputs.length} 个图片 / 视频素材
            </span>
            {mediaInputs.map((node) => (
                <label key={node.id} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate" title={node.title}>
                        {node.title}
                    </span>
                    {state.preset?.provider === "runninghub" ? <Select
                        size="small"
                        className="!w-36"
                        aria-label={`${node.title}输入角色`}
                        placeholder="选择素材角色"
                        value={state.inputRoles?.[node.id] || upstreamResource(node)?.kind}
                        options={workflowRoles.map(role => ({ value: role, label: role }))}
                        disabled={hasSubmission || busy}
                        onChange={role => patch({ inputRoles: { ...state.inputRoles, [node.id]: role } })}
                    /> : <Input
                        size="small"
                        className="!w-28"
                        aria-label={`${node.title}输入角色`}
                        placeholder={upstreamResource(node)?.kind || "image"}
                        value={state.inputRoles?.[node.id] || ""}
                        disabled={hasSubmission || busy}
                        onChange={(event) => patch({ inputRoles: { ...state.inputRoles, [node.id]: event.target.value } })}
                    />}
                </label>
            ))}
            {job && (
                <div className="flex flex-col gap-2" aria-live="polite">
                    <div className="flex items-center gap-2">
                        <Tag>{connectorJobLabels[job.status]}</Tag>
                        <span className="min-w-0 truncate" title={job.remoteId || job.id}>
                            {job.remoteId || job.id}
                        </span>
                    </div>
                    {typeof job.progress === "number" && <Progress percent={Math.round(job.progress)} size="small" status={job.status === "failed" ? "exception" : undefined} />}
                    {job.message && <span className="break-words">{job.message}</span>}
                    {job.status === "interrupted" && <span>提交中断，请在平台核查；不会自动重投。</span>}
                    {job.status === "save_failed" && <span>已保留 {job.outputs.length} 个本地结果，请恢复保存，不必重新生成。</span>}
                    {job.status === "query_failed" && <span>原任务可能仍在运行，请恢复查询。</span>}
                    {job.status === "succeeded" && (
                        <span style={{ color: ctx.theme.node.muted }}>
                            已导入 {state.importedOutputIds?.length || 0} / {job.outputs.length} 个结果
                        </span>
                    )}
                </div>
            )}
            {(error || serviceError || mappingError) && (
                <p role="alert" className="m-0 break-words">
                    {error || serviceError || mappingError}
                </p>
            )}
            <div className="mt-auto flex flex-wrap gap-1">
                {!hasSubmission ? (
                    <Button type="text" size="small" loading={busy} disabled={busy || !canSubmit || Boolean(mappingError)} icon={<Play className="size-3.5" />} onClick={() => void submit()}>
                        生成（可能消耗额度）
                    </Button>
                ) : (
                    <>
                        <Button type="text" size="small" loading={busy} disabled={busy} icon={<RefreshCw className="size-3.5" />} onClick={() => void refresh()}>
                            {job?.status === "save_failed" ? "恢复保存" : job?.status === "query_failed" ? "恢复查询" : state.jobId ? "刷新任务 / 导入结果" : "恢复提交结果"}
                        </Button>
                        {job && canCancelConnectorJob(job) && action?.canCancel && (
                            <Button
                                type="text"
                                size="small"
                                disabled={busy}
                                onClick={() =>
                                    void run(async () => {
                                        await receive(await connectorsApi.cancel(state.jobId!));
                                    })
                                }
                            >
                                取消远端任务
                            </Button>
                        )}
                        <Button type="text" size="small" disabled={busy} onClick={reset}>
                            重置为新任务
                        </Button>
                    </>
                )}
            </div>
        </div>
    );
}
