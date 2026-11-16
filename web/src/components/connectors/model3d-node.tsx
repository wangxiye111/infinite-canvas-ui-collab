import { useEffect, useRef, useState } from "react";
import { Box, Camera, Download, Loader2, Upload } from "lucide-react";
import { saveAs } from "file-saver";
import { nanoid } from "nanoid";

import { imageMetadata } from "@/lib/canvas/canvas-node-factory";
import { importGLB } from "@/lib/connectors/model3d";
import { validateGLB } from "@/lib/connectors/model3d-validation";
import { getMediaBlob, resolveMediaUrl } from "@/services/file-storage";
import { uploadImage } from "@/services/image-storage";
import { CanvasNodeType } from "@/types/canvas";
import type { CanvasNodeContext, CanvasNodeDefinition } from "@/types/canvas-plugin";
import type { Model3DViewer } from "./model3d-viewer";

function Model3DNode({ ctx }: { ctx: CanvasNodeContext }) {
    const hostRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const viewerRef = useRef<Model3DViewer | null>(null);
    const importVersion = useRef(0);
    const latest = useRef(ctx);
    latest.current = ctx;
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const source = ctx.node.metadata?.storageKey || ctx.node.metadata?.content || "";

    useEffect(
        () => () => {
            importVersion.current += 1;
        },
        [],
    );

    useEffect(() => {
        if (!source || !hostRef.current) return;
        const controller = new AbortController();
        setLoading(true);
        setError("");
        const metadata = latest.current.node.metadata;
        void (async () => {
            const url = await resolveMediaUrl(metadata?.storageKey, metadata?.content);
            const stored = metadata?.storageKey ? await getMediaBlob(metadata.storageKey) : null;
            const response = stored ? null : await fetch(url, { signal: controller.signal });
            if (response && !response.ok) throw new Error("模型文件读取失败");
            const data = await (stored || (await response!.blob())).arrayBuffer();
            validateGLB(data);
            controller.signal.throwIfAborted();
            const { createModel3DViewer } = await import("./model3d-viewer");
            controller.signal.throwIfAborted();
            const viewer = await createModel3DViewer(hostRef.current!, data, controller.signal);
            if (controller.signal.aborted) viewer.dispose();
            else {
                viewerRef.current = viewer;
                setLoading(false);
            }
        })().catch((cause) => {
            if (!controller.signal.aborted) {
                setError(cause instanceof Error ? cause.message : "模型预览失败");
                setLoading(false);
            }
        });
        return () => {
            controller.abort();
            viewerRef.current?.dispose();
            viewerRef.current = null;
        };
    }, [source]);

    useEffect(() => {
        let active = true;
        let capturing = false;
        const off = ctx.on(`connectors:model3d:${ctx.node.id}`, (action) => {
            if (action === "import") {
                inputRef.current?.click();
                return;
            }
            const current = latest.current;
            const currentSource = current.node.metadata?.storageKey || current.node.metadata?.content;
            const stillCurrent = () => active && (latest.current.node.metadata?.storageKey || latest.current.node.metadata?.content) === currentSource && Boolean(current.getNode(current.node.id));
            void (async () => {
                setError("");
                if (action === "download") {
                    const metadata = current.node.metadata;
                    const blob = metadata?.storageKey ? await getMediaBlob(metadata.storageKey) : null;
                    if (!blob) throw new Error("本地模型文件不存在，请重新导入");
                    saveAs(blob, metadata?.model3d?.fileName || `${current.node.title || "模型"}.glb`);
                }
                if (action === "capture") {
                    if (capturing) return;
                    if (!viewerRef.current) throw new Error("请等待模型预览完成后截图");
                    capturing = true;
                    try {
                        const image = await uploadImage(await viewerRef.current.capture());
                        if (!stillCurrent()) return;
                        const id = `image-${nanoid()}`;
                        const width = current.node.width;
                        current.applyOps([
                            {
                                type: "add_node",
                                id,
                                nodeType: CanvasNodeType.Image,
                                title: `${current.node.title} · 截图`,
                                position: { x: current.node.position.x + current.node.width + 60, y: current.node.position.y },
                                width,
                                height: (width * image.height) / image.width,
                                metadata: imageMetadata(image),
                            },
                            { type: "connect_nodes", fromNodeId: current.node.id, toNodeId: id },
                        ]);
                        if (image.storageKey) current.updateMetadata({ model3d: { ...current.node.metadata?.model3d, poster: { storageKey: image.storageKey } } });
                    } finally {
                        capturing = false;
                    }
                }
            })().catch((cause) => {
                if (stillCurrent()) setError(cause instanceof Error ? cause.message : "操作失败");
            });
        });
        return () => {
            active = false;
            off();
        };
    }, [ctx.node.id]);

    return (
        <div
            className="relative h-full w-full overflow-hidden"
            style={{ background: ctx.theme.node.panel, color: ctx.theme.node.muted }}
            onMouseDown={(event) => {
                if (!source || ctx.node.metadata?.interactive) event.stopPropagation();
            }}
            onPointerDown={(event) => {
                if (!source || ctx.node.metadata?.interactive) event.stopPropagation();
            }}
            onWheel={(event) => {
                if (ctx.node.metadata?.interactive) event.stopPropagation();
            }}
        >
            <input
                ref={inputRef}
                type="file"
                accept=".glb,model/gltf-binary"
                className="hidden"
                onChange={async (event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (!file) return;
                    const current = latest.current;
                    const version = ++importVersion.current;
                    setLoading(true);
                    setError("");
                    try {
                        const metadata = await importGLB(file);
                        if (version === importVersion.current && current.getNode(current.node.id)) {
                            current.updateMetadata(metadata);
                            current.updateNode({ title: file.name });
                        }
                    } catch (cause) {
                        if (version === importVersion.current) setError(cause instanceof Error ? cause.message : "GLB 导入失败");
                    } finally {
                        if (version === importVersion.current) setLoading(false);
                    }
                }}
            />
            <div ref={hostRef} className="h-full w-full" />
            {!source && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-xs">
                    <Box className="size-8" strokeWidth={1.2} />
                    <span>导入 GLB 模型，旋转查看并截图</span>
                    <button
                        type="button"
                        disabled={loading}
                        onClick={() => inputRef.current?.click()}
                        className="flex items-center gap-2 rounded px-3 py-2 hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-50"
                        style={{ color: ctx.theme.node.text }}
                    >
                        <Upload className="size-4" />
                        导入 GLB
                    </button>
                    <span style={{ color: ctx.theme.node.faint }}>纹理与资源需内嵌在 GLB 文件中</span>
                </div>
            )}
            {loading && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center" style={{ background: ctx.theme.node.panel }}>
                    <Loader2 className="size-5 animate-spin" />
                </div>
            )}
            {error && (
                <div role="status" className="absolute inset-x-0 bottom-0 px-3 py-2 text-xs" style={{ color: ctx.theme.node.text, background: ctx.theme.node.panel }}>
                    {error}
                </div>
            )}
        </div>
    );
}

export const model3dNodeDefinition: CanvasNodeDefinition = {
    type: "connectors:model3d",
    title: "3D 模型",
    icon: <Box className="size-4" />,
    description: "GLB 模型预览、下载与当前视角截图",
    defaultSize: { width: 420, height: 320 },
    defaultMetadata: { interactive: false },
    interactionToggle: true,
    hidePanel: true,
    Content: Model3DNode,
    toolbar: (ctx) => [
        { id: "importGLB", title: "导入 GLB", label: "导入", icon: <Upload className="size-4" />, onClick: () => ctx.emit(`connectors:model3d:${ctx.node.id}`, "import") },
        ...(ctx.node.metadata?.storageKey
            ? [
                  { id: "downloadGLB", title: "下载 GLB", label: "下载", icon: <Download className="size-4" />, onClick: () => ctx.emit(`connectors:model3d:${ctx.node.id}`, "download") },
                  { id: "captureGLB", title: "当前视角截图", label: "截图", icon: <Camera className="size-4" />, onClick: () => ctx.emit(`connectors:model3d:${ctx.node.id}`, "capture") },
              ]
            : []),
    ],
};
