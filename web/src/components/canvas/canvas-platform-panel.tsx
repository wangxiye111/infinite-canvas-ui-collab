import { Button, Checkbox, Popover, Select } from "antd";
import { CopyPlus, History, Settings2 } from "lucide-react";
import { useEffect, useState } from "react";
import { canvasThemes } from "@/lib/canvas-theme";
import type { PlatformBatch, PlatformResult } from "@/lib/canvas/platform-generation";
import { connectorJobLabels } from "@/services/api/connectors";
import { resolvePlatformResult } from "@/services/api/canvas-platform";
import { useConnectorManagerStore } from "@/stores/use-connectors-store";
import { useThemeStore } from "@/stores/use-theme-store";
import type { CanvasNodeData } from "@/types/canvas";
import type { PlatformGenerationController } from "./use-platform-generation";
import { platformModel, platformParameterLabels } from "@/lib/connectors/platform-models";

function ResultThumbnail({ output, selected, disabled, onSelect, onExtract }: { output: PlatformResult; selected: boolean; disabled: boolean; onSelect: () => void; onExtract: () => void }) {
    const [url, setUrl] = useState("");
    const theme = canvasThemes[useThemeStore(state => state.theme)];
    useEffect(() => {
        let cancelled = false;
        void resolvePlatformResult(output).then(item => { if (!cancelled) setUrl(item.content); }).catch(() => { if (!cancelled) setUrl(""); });
        return () => { cancelled = true; };
    }, [output.content, output.storageKey]);
    return <div className="w-28 shrink-0">
        <button type="button" disabled={disabled} onClick={onSelect} className="h-20 w-full overflow-hidden rounded-lg border" style={{ borderColor: selected ? theme.node.text : "transparent" }} title="选为节点当前输出" aria-label="选为节点当前输出">
            {url ? output.kind === "image" ? <img src={url} className="size-full object-contain" alt="生成候选" /> : <video src={url} className="size-full object-contain" muted preload="metadata" /> : <span className="text-xs">读取素材…</span>}
        </button>
        <Button type="text" size="small" block disabled={disabled} icon={<CopyPlus className="size-3" />} onClick={onExtract}>另存为节点</Button>
    </div>;
}

export function CanvasPlatformSettings({ node, controller: c }: { node: CanvasNodeData; controller: PlatformGenerationController }) {
    const openManager = useConnectorManagerStore(store => store.openManager);
    const locked = c.busy || c.needsRecovery;
    const preset = c.state.preset;
    const model = platformModel(c.provider, preset);
    const options = (preset?.params?.options || {}) as Record<string, string>;
    return <Popover trigger="click" placement="topLeft" content={<div className="w-72 space-y-3 text-xs" data-canvas-no-zoom>
        <div className="font-medium">{c.state.preset?.name || "生成设置"}</div>
        {model?.arguments.filter(arg => arg.name !== "prompt" && arg.allowedValues?.length).map(arg => <label key={arg.name} className="flex items-center justify-between gap-3">
            <span>{platformParameterLabels[arg.name] || arg.name}</span>
            <Select size="small" className="w-32" disabled={locked} allowClear={!arg.required} value={options[arg.name] ?? arg.default} placeholder="使用平台默认" options={arg.allowedValues!.map(value => ({ value, label: value === "true" ? "开启" : value === "false" ? "关闭" : value }))} onChange={value => {
                const next = { ...options };
                if (value === undefined) delete next[arg.name];
                else next[arg.name] = value;
                c.patch({ preset: { ...preset!, params: { ...preset!.params, options: next } } });
            }} />
        </label>)}
        {node.type === "image" && node.metadata?.content && <Checkbox disabled={locked} checked={Boolean(c.state.useCurrentImage)} onChange={event => c.patch({ useCurrentImage: event.target.checked })}>用当前图片作为参考</Checkbox>}
        {c.references.map(reference => <div key={reference.nodeId} className="flex items-center justify-between gap-2"><span className="truncate">{reference.name}</span><Select size="small" className="w-32 shrink-0" placeholder="素材用途" disabled={locked} value={reference.role || undefined} options={c.state.preset?.provider === "runninghub" ? c.roles.map(role => ({ value: role, label: role })) : ["image_to_video", "frames2video"].includes(c.state.preset?.action || "") ? [{ value: "image", label: "首帧" }, ...(c.state.preset?.provider === "jimeng" || model?.inputs.some(input => input.name === "tail_image") ? [{ value: "tailImage", label: "尾帧" }] : [])] : [{ value: "image", label: "参考图片" }]} onChange={role => c.patch({ inputRoles: { ...c.state.inputRoles, [reference.nodeId]: role } })} /></div>)}
        {c.canUseBuiltInPrompt && <p>此工作流使用内置提示词。需要修改时，请在平台设置中配置提示词映射。</p>}
        <dl className="space-y-1 opacity-70">{Object.entries(c.state.preset?.params || {}).filter(([, value]) => typeof value === "string" || typeof value === "number" || typeof value === "boolean").map(([key, value]) => <div key={key} className="flex justify-between gap-4"><dt>{key}</dt><dd className="max-w-44 truncate" title={String(value)}>{String(value)}</dd></div>)}</dl>
        {c.changedPreset && <Button type="text" size="small" disabled={locked} onClick={() => c.patch({ preset: structuredClone(c.savedPreset!) })}>使用已更新的预设</Button>}
        <Button type="text" size="small" onClick={openManager}>编辑平台预设</Button>
        {c.provider?.billing && <p className="opacity-60">{c.provider.billing}</p>}
        {c.serviceError && <p role="alert">{c.serviceError}</p>}
    </div>}><Button type="text" size="small" icon={<Settings2 className="size-3.5" />}>参数</Button></Popover>;
}

export function CanvasPlatformHistory({ node, controller: c }: { node: CanvasNodeData; controller: PlatformGenerationController }) {
    const batches = [...(c.state.current ? [c.state.current] : []), ...[...(c.state.history || [])].reverse()];
    const list = (item: PlatformBatch) => <div className="flex gap-2 overflow-x-auto py-2">{item.outputs.map(output => <ResultThumbnail key={output.id} output={output} selected={Boolean(output.storageKey && output.storageKey === node.metadata?.storageKey)} disabled={c.busy} onSelect={() => { void c.selectOutput(item, output, false); }} onExtract={() => { void c.selectOutput(item, output, true); }} />)}</div>;
    if (!batches.length) return null;
    return <Popover trigger="click" placement="topRight" content={<div className="thin-scrollbar max-h-80 w-80 max-w-[75vw] overflow-y-auto text-xs" data-canvas-no-zoom>
        <div className="mb-3 font-medium">候选与历史</div>
        {batches.map(item => <div key={item.requestId} className="mb-4">
            <div className="flex justify-between gap-2"><span className="truncate">{item.preset?.name || "原有素材"}</span><span className="shrink-0 opacity-60">{item.status ? connectorJobLabels[item.status] : "已保存"}</span></div>
            <p className="mt-1 truncate opacity-60" title={item.prompt}>{item.prompt}</p>{list(item)}
            <details className="opacity-60"><summary className="cursor-pointer">生成详情</summary><pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap">{JSON.stringify({ preset: item.preset, prompt: item.prompt, message: item.message, requestId: item.requestId, jobId: item.jobId, references: item.references.map(ref => ({ name: ref.name, role: ref.role })) }, null, 2)}</pre></details>
        </div>)}
        {c.needsRecovery && <div className="flex gap-2"><Button type="text" size="small" loading={c.busy} onClick={() => { void c.refresh(); }}>查询原任务</Button><Button type="text" size="small" disabled={!c.roundActions.canStart} onClick={c.newRound}>核查后开始新一轮</Button></div>}
    </div>}><Button type="text" size="small" icon={<History className="size-3.5" />} aria-label="候选与历史">{c.batch?.outputs.length ? `${c.batch.outputs.length} 个结果` : "历史"}</Button></Popover>;
}

