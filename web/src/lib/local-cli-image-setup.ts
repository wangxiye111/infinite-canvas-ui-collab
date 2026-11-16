import type { LocalCliProvider } from "@/services/api/local-cli";
import type { AiConfig, ModelChannel } from "@/stores/use-config-store";

/** UI alias only. The backend resolves an official-model-list image driver for each image process. */
export const LOCAL_CODEX_IMAGE_MODEL = "codex-image-default";
export const LOCAL_ANTIGRAVITY_IMAGE_MODEL = "antigravity-image-default";

export function antigravityImageConnection(provider?: LocalCliProvider, error?: string) {
    if (error) return { code: "service-unavailable", title: "本地服务不可用", message: "启动本地连接服务后重新检测。" };
    if (!provider) return { code: "unchecked", title: "待检测", message: "登录 Google 后，点击「检测连接」。" };
    if (provider.state === "not-installed") return { code: "not-installed", title: "未安装 Antigravity CLI", message: "完成第 1 步安装后重新检测。" };
    if (provider.state === "error" || provider.state === "not-connected") return { code: "error", title: "连接失败", message: "请在连接详情中查看原因，然后重新检测。" };
    if (provider.details?.loginState === "not-authenticated") return { code: "not-authenticated", title: "Google 尚未登录", message: "点击「登录 Google」，完成后回来检测连接。" };
    if (provider.details?.loginState !== "authenticated") return { code: "unchecked", title: "待检测", message: "登录 Google 后，点击「检测连接」。" };
    if (provider.state !== "ready" || provider.details.imageAvailable !== true || provider.details.imageAdapter !== "antigravity-acp" || !provider.actions.some((action) => action.id === "image" && action.output === "image")) {
        return { code: "image-unavailable", title: "生图连接待检测", message: "请重新检测连接，具体原因见连接详情。" };
    }
    return { code: "available", title: "Antigravity 已连接", message: "可以添加 Gemini 图片模型。" };
}

/** Adding Gemini preserves the user's existing image default. */
export function configureAntigravityImage(config: AiConfig, provider: LocalCliProvider, channelId: string): AiConfig {
    const connection = antigravityImageConnection(provider);
    if (provider.id !== "antigravity-cli" || connection.code !== "available") throw new Error(`${connection.title}：${connection.message}`);
    const existing = config.channels.find((channel) => channel.apiFormat === "antigravity-cli" && !channel.models.some((model) => model.name === LOCAL_ANTIGRAVITY_IMAGE_MODEL && model.capability !== "image"));
    const channel: ModelChannel = existing || { id: channelId, name: "本机 Antigravity", baseUrl: "", apiKey: "", apiFormat: "antigravity-cli", models: [] };
    const updated = channel.models.some((model) => model.name === LOCAL_ANTIGRAVITY_IMAGE_MODEL)
        ? channel
        : { ...channel, models: [...channel.models, { name: LOCAL_ANTIGRAVITY_IMAGE_MODEL, capability: "image" as const }] };
    const channels = existing ? config.channels.map((item) => item === existing ? updated : item) : [...config.channels, updated];
    return { ...config, channels, models: channels.flatMap((item) => item.models.map((model) => `${item.id}::${model.name}`)) };
}

export function codexImageConnection(provider?: LocalCliProvider, error?: string) {
    if (error) return { code: "service-unavailable", title: "本地服务不可用", message: "启动本地连接服务后重新检测。" };
    if (!provider) return { code: "unchecked", title: "待检测", message: "检测 Codex 后配置 GPT 生图。" };
    if (provider.state === "not-installed") return { code: "not-installed", title: "未安装 Codex CLI", message: "安装 Codex，或在高级设置中填写路径。" };
    if (provider.state === "error") return { code: "error", title: "检测失败", message: "查看连接详情后重新检测。" };
    if (provider.details?.authMethod === "api-key") return { code: "api-key", title: "当前为 API Key 登录", message: "请在 Codex 中使用 ChatGPT 账号登录后重新检测。" };
    if (provider.details?.loginState === "not-authenticated") return { code: "not-authenticated", title: "Codex 尚未登录", message: "在终端运行 codex，使用 ChatGPT 账号登录后重新检测。" };
    if (provider.details?.loginState !== "authenticated") return { code: "unchecked", title: "登录待确认", message: "请重新检测 Codex 登录状态。" };
    if (provider.details.imageDriverError) return { code: "image-driver-error", title: "模型检测失败", message: provider.details.imageMessage || "请重新检测官方模型目录。" };
    if (provider.details.imageDriverState === "unavailable") return { code: "image-driver-unavailable", title: "生图暂不可用", message: "请重新检测，具体原因见连接详情。" };
    if (provider.details.imageAvailable !== true || provider.details.imageAdapter !== "codex-native" || !provider.actions.some((action) => action.id === "image" && action.output === "image")) {
        return { code: "image-unavailable", title: "生图暂不可用", message: "更新 Codex 和本地连接服务后重新检测。" };
    }
    const driver = provider.details.imageDriverModel?.trim();
    const reasoning = provider.details.imageDriverReasoning?.trim();
    if (provider.details.imageDriverState !== "available" || provider.details.imageDriverSource !== "official-model-list" || !driver || !reasoning) {
        return { code: "image-driver-unchecked", title: "生图待检测", message: "请重新检测后配置 GPT 生图。" };
    }
    if (provider.state !== "ready") return { code: "unchecked", title: "检测未完成", message: "请重新检测 Codex 连接。" };
    return { code: "available", title: "Codex 已连接", message: "可设为生图默认。" };
}

/** Called only after the user's explicit setup click. Never modifies credentials or other defaults. */
export function configureCodexImage(config: AiConfig, provider: LocalCliProvider, channelId: string): AiConfig {
    const connection = codexImageConnection(provider);
    if (provider.id !== "codex-cli" || connection.code !== "available") throw new Error(`${connection.title}：${connection.message}`);
    const existing = config.channels.find((channel) => channel.apiFormat === "codex-cli" && !channel.models.some((model) => model.name === LOCAL_CODEX_IMAGE_MODEL && model.capability !== "image"));
    const channel: ModelChannel = existing || { id: channelId, name: "本机 Codex", baseUrl: "", apiKey: "", apiFormat: "codex-cli", models: [] };
    const updated = channel.models.some((model) => model.name === LOCAL_CODEX_IMAGE_MODEL)
        ? channel
        : { ...channel, models: [...channel.models, { name: LOCAL_CODEX_IMAGE_MODEL, capability: "image" as const }] };
    const channels = existing ? config.channels.map((item) => item === existing ? updated : item) : [...config.channels, updated];
    return {
        ...config,
        channels,
        models: channels.flatMap((item) => item.models.map((model) => `${item.id}::${model.name}`)),
        imageModel: `${channel.id}::${LOCAL_CODEX_IMAGE_MODEL}`,
    };
}
