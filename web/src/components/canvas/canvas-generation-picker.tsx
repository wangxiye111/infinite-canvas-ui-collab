import { App, Button, Input, Popover } from "antd";
import { Check, ChevronDown, Settings2 } from "lucide-react";
import { useState } from "react";
import { LocalCliImageConnection } from "@/components/local-cli-image-connection";
import { platformPresetKind, selectCanvasGenerator } from "@/lib/canvas/platform-generation";
import { connectorProviderNames, type ConnectorPreset } from "@/services/api/connectors";
import { modelOptionLabel, selectableModelsByCapability, useConfigStore, type AiConfig } from "@/stores/use-config-store";
import { useConnectorManagerStore, useConnectorsStore } from "@/stores/use-connectors-store";
import type { CanvasNodeData, CanvasNodeMetadata } from "@/types/canvas";
import { connectedPlatformPresets } from "@/lib/connectors/platform-models";

export function CanvasGenerationPicker({ node, config, disabled, onChange }: { node: CanvasNodeData; config: AiConfig; disabled: boolean; onChange: (patch: CanvasNodeMetadata) => void }) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const { message } = App.useApp();
    const presets = useConnectorsStore(state => state.presets);
    const providers = useConnectorsStore(state => state.providers);
    const openManager = useConnectorManagerStore(state => state.openManager);
    const openConfig = useConfigStore(state => state.openConfigDialog);
    const state = node.metadata?.platformGeneration;
    const selected = state?.enabled ? state.preset : undefined;
    const models = selectableModelsByCapability(config, node.type === "video" ? "video" : "image");
    const choose = (selection: { model: string } | { preset: ConnectorPreset }) => {
        try { onChange(selectCanvasGenerator(node, selection)); setOpen(false); }
        catch (error) { void message.error(error instanceof Error ? error.message : "无法切换模型"); }
    };
    const label = selected ? `${connectorProviderNames[selected.provider]} · ${selected.name}` : state?.enabled ? "选择模型" : modelOptionLabel(config, config.model) || "选择模型";
    return <Popover open={open} onOpenChange={setOpen} trigger="click" placement="topLeft" content={<div className="thin-scrollbar max-h-80 w-72 max-w-[75vw] overflow-y-auto" data-canvas-no-zoom>
        <div className="px-2 py-2 text-xs opacity-50">模型与工作流</div>
        <Input size="small" variant="borderless" placeholder="搜索模型或生成方式" value={search} onChange={event => setSearch(event.target.value)} allowClear />
        {models.filter(model => modelOptionLabel(config, model).toLowerCase().includes(search.toLowerCase())).map(model => <Button key={model} type="text" block className="!flex !justify-start !text-left" onClick={() => choose({ model })}><span className="min-w-0 flex-1 truncate">{modelOptionLabel(config, model)}</span>{!state?.enabled && config.model === model && <Check className="size-3.5" />}</Button>)}
        {(["kling", "jimeng", "runninghub"] as const).map(provider => {
            const items = [...connectedPlatformPresets(providers), ...presets].filter(preset => preset.provider === provider && platformPresetKind(preset) === node.type);
            if (selected?.provider === provider && !items.some(item => item.id === selected.id)) items.push(selected);
            return <div key={provider} className="mt-2">
                <div className="px-2 py-1 text-xs opacity-50">{connectorProviderNames[provider]}{provider === "runninghub" ? " 工作流" : ""}</div>
                {items.length ? items.filter(preset => `${connectorProviderNames[provider]} ${preset.name}`.toLowerCase().includes(search.toLowerCase())).map(preset => <Button key={preset.id} type="text" block className="!flex !justify-start !text-left" onClick={() => choose({ preset })}><span className="min-w-0 flex-1 truncate" title={preset.name}>{preset.name}</span>{selected?.id === preset.id && <Check className="size-3.5" />}</Button>) : <Button type="text" block className="!justify-start" onClick={() => { setOpen(false); openManager(); }}>配置{connectorProviderNames[provider]}{provider === "runninghub" ? "工作流" : ""}</Button>}
            </div>;
        })}
        <div className="mt-3 flex flex-wrap items-center gap-1">
            {node.type === "image" && <LocalCliImageConnection compact model={config.model} onSelect={model => choose({ model })} />}
            <Button type="text" size="small" icon={<Settings2 className="size-3.5" />} onClick={() => { setOpen(false); openConfig(true); }}>模型设置</Button>
        </div>
    </div>}><Button type="text" disabled={disabled} className="!h-8 !max-w-52 !px-2" title={label}><span className="truncate">{label}</span><ChevronDown className="size-3 shrink-0 opacity-50" /></Button></Popover>;
}
