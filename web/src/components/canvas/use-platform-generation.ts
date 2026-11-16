import { App } from "antd";
import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { archivePlatformBatch, platformNeedsRecovery, platformResultMetadata, platformRoundActions, type PlatformBatch, type PlatformGenerationState, type PlatformReference, type PlatformResult } from "@/lib/canvas/platform-generation";
import { getNodeDefinition } from "@/lib/canvas/node-registry";
import { fitNodeSize } from "@/lib/canvas/canvas-node-size";
import { runningHubInputRoles } from "@/lib/connectors/runninghub-preset";
import { connectorsApi, CONNECTOR_POLL_INTERVAL_MS } from "@/services/api/connectors";
import { platformDependencies, receivePlatformJob, refreshPlatformNode, resolvePlatformResult, submitPlatformNode, type PlatformSession } from "@/services/api/canvas-platform";
import { useConnectorsStore } from "@/stores/use-connectors-store";
import { saveCanvasNodeNow } from "@/stores/canvas/use-canvas-store";
import type { CanvasNodeData } from "@/types/canvas";
import type { CanvasPluginHost } from "@/types/canvas-plugin";

const operations = new Set<string>();
const activeStatuses = ["submitting", "queued", "running", "saving"];

function writePlatformNode(host: CanvasPluginHost, node: CanvasNodeData, patch: NonNullable<CanvasNodeData["metadata"]>) {
    host.updateMetadata(node.id, patch);
    const bound = Math.max(node.width, node.height);
    const size = patch.content && patch.naturalWidth && patch.naturalHeight ? fitNodeSize(patch.naturalWidth, patch.naturalHeight, bound, bound) : {};
    if ("width" in size) host.updateNode(node.id, size);
    return { ...node, ...size, metadata: { ...node.metadata, ...patch } };
}

export function useBackgroundVideoJob(node: CanvasNodeData, host: CanvasPluginHost | undefined, showPanel: boolean) {
    const { id: canvasId = "" } = useParams<{ id: string }>();
    const state = node.metadata?.platformGeneration;
    const jobId = node.type === "video" && state?.enabled && activeStatuses.includes(state.current?.status || "") ? state.current?.jobId : undefined;
    const nodeId = node.id;
    useEffect(() => {
        if (!host || showPanel || !jobId) return;
        const key = `${canvasId}:${nodeId}`;
        let stopped = false;
        const timer = window.setInterval(async () => {
            if (operations.has(key)) return;
            let current = host.getNode(nodeId);
            const read = () => !stopped && current?.metadata?.platformGeneration?.current?.jobId === jobId ? current : null;
            if (!read()) return;
            const write: PlatformSession["write"] = patch => {
                const entry = read();
                if (entry && host.getNode(nodeId)?.metadata?.platformGeneration?.current?.jobId === jobId) current = writePlatformNode(host, entry, patch);
            };
            operations.add(key);
            try {
                await refreshPlatformNode({ canvasId, nodeId, read, write, persist: async () => {
                    const entry = read();
                    if (entry) await saveCanvasNodeNow(canvasId, entry);
                } }, { ...platformDependencies, recordJob: useConnectorsStore.getState().setJob });
            } catch {
                const generation = read()?.metadata?.platformGeneration;
                if (generation?.current && activeStatuses.includes(generation.current.status || "")) write({ platformGeneration: { ...generation, current: { ...generation.current, status: "query_failed", message: "查询原任务失败，请打开节点重查" } } });
            } finally { operations.delete(key); }
        }, CONNECTOR_POLL_INTERVAL_MS);
        return () => { stopped = true; window.clearInterval(timer); };
    }, [canvasId, host, jobId, nodeId, showPanel]);
}

export function usePlatformGeneration(node: CanvasNodeData, host: CanvasPluginHost, prompt: string) {
    const { id: canvasId = "" } = useParams<{ id: string }>();
    const { modal } = App.useApp();
    const presets = useConnectorsStore(store => store.presets);
    const providers = useConnectorsStore(store => store.providers);
    const load = useConnectorsStore(store => store.load);
    const serviceError = useConnectorsStore(store => store.error);
    const setJob = useConnectorsStore(store => store.setJob);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [pollStopped, setPollStopped] = useState(false);
    const mounted = useRef(false);
    const latest = useRef({ node, host, canvasId });
    latest.current = { node, host, canvasId };
    const state = node.metadata?.platformGeneration || {};
    const batch = state.current;
    const provider = providers.find(item => item.id === state.preset?.provider);
    const active = Boolean(state.enabled && batch?.jobId && activeStatuses.includes(batch.status || ""));
    const roundActions = platformRoundActions(batch, busy, pollStopped);
    const dependencies = { ...platformDependencies, recordJob: setJob };
    const readNode = () => mounted.current && latest.current.canvasId === canvasId && latest.current.node.id === node.id && latest.current.host.getNode(node.id) ? latest.current.node : null;
    const writeNode = (patch: NonNullable<CanvasNodeData["metadata"]>) => {
        const current = readNode();
        if (current) latest.current.node = writePlatformNode(latest.current.host, current, patch);
    };
    const session: PlatformSession = {
        canvasId, nodeId: node.id,
        read: () => latest.current.node.metadata?.platformGeneration?.enabled ? readNode() : null,
        write: patch => { if (session.read()) writeNode(patch); },
        persist: async () => {
            const current = session.read();
            if (current) await saveCanvasNodeNow(canvasId, current);
        },
    };
    const patch = (change: Partial<PlatformGenerationState>) => {
        const current = session.read();
        if (current) session.write({ platformGeneration: { ...current.metadata?.platformGeneration, ...change } });
    };
    const run = async (action: () => Promise<void>) => {
        const key = `${canvasId}:${node.id}`;
        if (operations.has(key)) return;
        operations.add(key);
        setBusy(true);
        setError("");
        setPollStopped(false);
        try { await action(); }
        catch (err) { if (readNode()) { setError(err instanceof Error ? err.message : "平台任务操作失败"); setPollStopped(true); } }
        finally { operations.delete(key); if (mounted.current && latest.current.node.id === node.id) setBusy(false); }
    };
    const refresh = () => run(() => refreshPlatformNode(session, dependencies));
    const upstream = host.getUpstream(node.id);
    const resources = upstream.map(item => ({ node: item, resource: getNodeDefinition(item.type)?.resource?.(item) }));
    const unsupportedInput = resources.find(item => !item.resource || !["text", "image", "video"].includes(item.resource.kind));
    const sources = [...resources.filter(item => item.resource?.kind === "image" || item.resource?.kind === "video"), ...(state.useCurrentImage && node.type === "image" && node.metadata?.content ? [{ node, resource: { kind: "image" as const, url: node.metadata.content } }] : [])];
    let roles: string[] = [];
    let mappingError = "";
    try { roles = runningHubInputRoles(state.preset); }
    catch (err) { mappingError = err instanceof Error ? err.message : "工作流映射无效"; }
    const references: PlatformReference[] = sources.map(({ node: source, resource }) => ({ nodeId: source.id, name: source.title || source.id, kind: resource!.kind as "image" | "video", content: resource!.url || "", storageKey: source.metadata?.storageKey, mimeType: source.metadata?.mimeType, role: state.inputRoles?.[source.id] || (state.preset?.provider === "runninghub" ? roles.length === 1 ? roles[0] : "" : "image") }));
    const fullPrompt = [prompt.trim(), ...resources.filter(item => item.resource?.kind === "text").map(item => item.resource?.text)].filter(Boolean).join("\n\n");
    const canUseBuiltInPrompt = state.preset?.provider === "runninghub" && !state.preset.params?.promptTarget;
    if (unsupportedInput) mappingError = `当前预设不能读取「${unsupportedInput.node.title}」，请直接连接图片、视频或文本素材`;
    const referenceIdentity = (items: PlatformReference[]) => JSON.stringify(items.map(item => [item.nodeId, item.role, item.storageKey || item.content]));
    const referencesChanged = batch && referenceIdentity(references) !== referenceIdentity(batch.references);
    const savedPreset = presets.find(item => item.id === state.preset?.id);
    const changedPreset = savedPreset && JSON.stringify(savedPreset) !== JSON.stringify(state.preset);

    useEffect(() => { mounted.current = true; void load(); return () => { mounted.current = false; }; }, [load]);
    useEffect(() => {
        if (!state.enabled || !platformNeedsRecovery(batch)) return;
        void run(async () => {
            if (batch.jobId) await receivePlatformJob(session, await connectorsApi.job(batch.jobId), dependencies);
            else await refreshPlatformNode(session, dependencies);
        });
        // A graph edit must not restart submission or task loading.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [canvasId, node.id, state.enabled]);
    useEffect(() => {
        if (!active || busy || pollStopped) return;
        const timer = window.setTimeout(() => { void refresh(); }, CONNECTOR_POLL_INTERVAL_MS);
        return () => window.clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active, busy, pollStopped, batch]);

    const newRound = () => {
        const archive = () => { const current = session.read()?.metadata?.platformGeneration; if (current) patch(archivePlatformBatch(current)); setError(""); };
        if (roundActions.needsConfirmation) {
            modal.confirm({ title: "确认原任务状态", content: "原任务记录会保留在历史中。开始新一轮不会取消远端任务，再次生成会产生新的消耗；请先在平台核查。", okText: "已核查，开始新一轮", cancelText: "保留原任务", onOk: archive });
        } else archive();
    };
    const selectOutput = (item: PlatformBatch, output: PlatformResult, extract: boolean) => run(async () => {
        const outputs = await Promise.all(item.outputs.map(resolvePlatformResult));
        const current = readNode();
        if (!current) return;
        const metadata = platformResultMetadata(node.type, outputs, output.id);
        if (extract) {
            const size = metadata.naturalWidth && metadata.naturalHeight ? fitNodeSize(metadata.naturalWidth, metadata.naturalHeight, current.width, current.height) : { width: current.width, height: current.height };
            latest.current.host.applyOps([{ type: "add_node", id: crypto.randomUUID(), nodeType: node.type, title: item.prompt.slice(0, 32) || "生成结果", x: current.position.x + current.width + 100, y: current.position.y, ...size, metadata: { ...platformResultMetadata(node.type, outputs.filter(result => result.id === output.id), output.id), prompt: item.prompt } }]);
        } else writeNode(metadata);
    });
    const needsRecovery = platformNeedsRecovery(batch);
    const generate = () => run(async () => {
        if (platformNeedsRecovery(session.read()?.metadata?.platformGeneration?.current)) {
            await refreshPlatformNode(session, dependencies);
            return;
        }
        const current = session.read()?.metadata?.platformGeneration;
        if (current?.current) patch(archivePlatformBatch(current));
        await submitPlatformNode(session, provider, fullPrompt, references, dependencies);
    });
    return { state, batch, provider, busy, error, serviceError, mappingError, pollStopped, active, needsRecovery,
        references, referencesChanged, roles, canUseBuiltInPrompt, fullPrompt, savedPreset, changedPreset,
        patch, refresh, generate, newRound, roundActions, selectOutput };
}
export type PlatformGenerationController = ReturnType<typeof usePlatformGeneration>;
