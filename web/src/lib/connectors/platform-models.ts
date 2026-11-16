import type { ConnectorPreset, ConnectorProvider } from "@/services/api/connectors";

export type PlatformModel = {
    model: string;
    arguments: { name: string; required?: boolean; default?: string; allowedValues?: string[] }[];
    inputs: { name: string; required?: boolean }[];
};
export function platformModels(provider?: ConnectorProvider): Record<string, PlatformModel[]> {
    return (provider?.details as { models?: Record<string, PlatformModel[]> } | undefined)?.models || {};
}
export function platformModel(provider: ConnectorProvider | undefined, preset?: ConnectorPreset) {
    return preset && platformModels(provider)[preset.action]?.find(model => model.model === preset.model);
}
export function connectedPlatformPresets(providers: ConnectorProvider[]): ConnectorPreset[] {
    return providers.filter(provider => ["kling", "jimeng"].includes(provider.id) && ["ready", "configured"].includes(provider.state)).flatMap(provider => provider.actions.flatMap(action => (platformModels(provider)[action.id] || []).filter(model => {
        if (provider.id !== "kling") return true;
        if (action.id === "image_to_image") return model.inputs.some(input => input.name === "image_1");
        if (action.id === "image_to_video") return model.inputs.some(input => input.name === "first_image");
        return true;
    }).map(model => ({
        id: `official:${provider.id}:${action.id}:${model.model}`,
        provider: provider.id, action: action.id, model: model.model,
        name: `${model.model} · ${action.label}`,
        params: { options: Object.fromEntries(model.arguments.filter(arg => arg.name !== "prompt" && arg.default !== undefined && arg.allowedValues?.length).map(arg => [arg.name, arg.default])) },
    }))));
}

export const platformParameterLabels: Record<string, string> = {
    aspect_ratio: "画面比例", ratio: "画面比例", img_resolution: "清晰度", resolution: "清晰度", resolution_type: "清晰度", video_resolution: "清晰度",
    imageCount: "候选数量", generate_num: "候选数量", duration: "时长（秒）", enable_audio: "同步声音", enable_asmr: "环境音", story_mode: "连续画面", prefer_multi_shots: "智能分镜",
};
