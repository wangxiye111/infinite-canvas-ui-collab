import { App, Button, Tooltip, theme } from "antd";
import { ArrowUpRight, RefreshCw, Settings2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { nanoid } from "nanoid";
import { useLocalCliProviders } from "@/hooks/use-local-cli-providers";
import { antigravityImageConnection, codexImageConnection, configureAntigravityImage, configureCodexImage, LOCAL_ANTIGRAVITY_IMAGE_MODEL, LOCAL_CODEX_IMAGE_MODEL } from "@/lib/local-cli-image-setup";
import { localCliApi } from "@/services/api/local-cli";
import { decodeChannelModel, useConfigStore } from "@/stores/use-config-store";

/** Shared by setup, the image workbench and canvas image nodes. Checks never generate. */
export function LocalCliImageConnection({ model, engine, setup = false, compact = false, onSelect }: { model?: string; engine?: "codex-cli" | "antigravity-cli"; setup?: boolean; compact?: boolean; onSelect?: (model: string) => void }) {
    const { message } = App.useApp();
    const { token } = theme.useToken();
    const navigate = useNavigate();
    const config = useConfigStore((state) => state.config);
    const openConfig = useConfigStore((state) => state.openConfigDialog);
    const selected = decodeChannelModel(model || config.imageModel);
    const channel = config.channels.find((item) => item.id === selected?.channelId);
    const isCodex = (engine || channel?.apiFormat) === "codex-cli";
    const isAntigravity = (engine || channel?.apiFormat) === "antigravity-cli";
    const providerId = isAntigravity ? "antigravity-cli" : "codex-cli";
    const title = isAntigravity ? "Gemini 生图（本机 Antigravity）" : "GPT 生图（本机 Codex）";
    const providers = useLocalCliProviders(setup || isCodex || isAntigravity);
    const provider = providers.data?.find((item) => item.id === providerId);
    const [busy, setBusy] = useState(false);
    const [checkError, setCheckError] = useState("");
    const pending = useRef(false);
    const connection = (isAntigravity ? antigravityImageConnection : codexImageConnection)(provider, checkError || (providers.error ? String(providers.error) : undefined));
    const defaultModel = decodeChannelModel(config.imageModel);
    const geminiChannel = config.channels.find((item) => item.apiFormat === "antigravity-cli" && item.models.some((entry) => entry.name === LOCAL_ANTIGRAVITY_IMAGE_MODEL && entry.capability === "image"));
    const configuredModel = isAntigravity ? (geminiChannel ? `${geminiChannel.id}::${LOCAL_ANTIGRAVITY_IMAGE_MODEL}` : "") : defaultModel?.model === LOCAL_CODEX_IMAGE_MODEL && config.channels.some((item) => item.id === defaultModel.channelId && item.apiFormat === "codex-cli" && item.models.some((entry) => entry.name === LOCAL_CODEX_IMAGE_MODEL && entry.capability === "image")) ? config.imageModel : "";
    const status = connection.code === "available" ? configuredModel ? isAntigravity ? "已添加到图片模型" : "已设为生图默认" : "已连接，待配置" : connection.title;
    const nextStep = connection.code === "available" ? configuredModel ? `在图片节点或生图工作台选择「${title}」。` : isAntigravity ? "点击「添加 Gemini 图片模型」，然后在生图时选择它。" : "点击「检测并配置」，将 GPT 生图加入模型列表并设为默认。" : connection.message;
    const detail = checkError || (providers.error ? String(providers.error) : "") || provider?.details?.imageMessage || provider?.message;
    // Successful checks can retain the same provider object through query structural sharing.
    useEffect(() => { setCheckError(""); }, [providers.dataUpdatedAt, providerId]);

    const detectAndConfigure = async () => {
        if (pending.current) return;
        pending.current = true;
        setBusy(true);
        setCheckError("");
        let checked = false;
        try {
            const result = isAntigravity ? await localCliApi.check("antigravity-cli") : await localCliApi.check("codex-cli");
            checked = true;
            providers.setProvider(result);
            if (isAntigravity) return;
            const current = useConfigStore.getState().config;
            const next = configureCodexImage(current, result, nanoid());
            useConfigStore.setState({ config: next });
            message.success("已将 GPT 生图（本机 Codex）设为默认图片模型。");
        } catch (cause) {
            const error = cause instanceof Error ? cause.message : "检测失败，请检查本地连接服务。";
            if (!checked) setCheckError(error);
            message.warning(error);
        } finally { pending.current = false; setBusy(false); }
    };

    const addGemini = () => {
        if (!provider || pending.current) return;
        try {
            const next = configureAntigravityImage(useConfigStore.getState().config, provider, nanoid());
            useConfigStore.setState({ config: next });
            message.success("已添加 Gemini 生图（本机 Antigravity），可在图片模型列表中选择。");
        } catch (cause) { message.warning(cause instanceof Error ? cause.message : "请先检测连接。"); }
    };
    const checkLabel = isAntigravity ? "检测 Gemini 生图连接" : "检测并配置 GPT 生图（本机 Codex）";

    if (compact) return <div className="flex h-5 items-center gap-1" style={{ color: token.colorTextSecondary }}>
        <Tooltip title={`${title} · ${status}。${nextStep}`}>
            <Button type="text" size="small" className="!h-5 !px-1 !text-[11px]" icon={<RefreshCw size={11} />} aria-label={checkLabel} loading={busy} disabled={providers.isFetching} onClick={() => void detectAndConfigure()}>{isAntigravity ? "检测 Gemini 连接" : "配置 Codex 生图"}</Button>
        </Tooltip>
        {onSelect && configuredModel && configuredModel !== model && <Button type="text" size="small" className="!h-5 !px-1 !text-[11px]" onClick={() => onSelect(configuredModel)}>{isAntigravity ? "此节点使用 Gemini" : "此节点使用 Codex"}</Button>}
        <Tooltip title="连接设置">
            <Button type="text" size="small" className="!h-5 !w-5 !p-0" icon={<Settings2 size={12} />} aria-label="连接设置" onClick={() => openConfig(false, "local-cli", providerId)} />
        </Tooltip>
    </div>;

    return <div className="space-y-2 text-xs leading-relaxed" style={{ color: token.colorTextSecondary }}>
        <div className="font-medium" style={{ color: token.colorText }}>{title}</div>
        {(setup || isCodex || isAntigravity || checkError || provider) && <div role="status">
            <span>{providers.isFetching ? "正在检测…" : status}</span>
            {!providers.isFetching && <span> · {nextStep}</span>}
        </div>}
        <div className="flex flex-wrap items-center gap-x-1">
            <Button type="text" size="small" icon={<RefreshCw size={13} />} aria-label={checkLabel} loading={busy} disabled={providers.isFetching} onClick={() => void detectAndConfigure()}>{isAntigravity ? "检测连接" : configuredModel ? "重新检测" : "检测并配置"}</Button>
            {isAntigravity && !configuredModel && <Button type="text" size="small" disabled={connection.code !== "available" || busy || providers.isFetching} onClick={addGemini}>添加 Gemini 图片模型</Button>}
            {setup && configuredModel && <Button type="text" size="small" icon={<ArrowUpRight size={13} />} onClick={() => { useConfigStore.getState().setConfigDialogOpen(false); navigate("/image"); }}>前往生图工作台</Button>}
            {!setup && <Button type="text" size="small" onClick={() => openConfig(false, "local-cli", providerId)}>连接设置</Button>}
            {onSelect && configuredModel && configuredModel !== model && <Button type="text" size="small" onClick={() => onSelect(configuredModel)}>{isAntigravity ? "此节点使用 Gemini" : "此节点使用 Codex"}</Button>}
        </div>
        {(detail || isCodex || isAntigravity) && <details>
            <summary className="cursor-pointer py-1">连接详情</summary>
            <div className="space-y-1 py-1">
                {detail && <p className="whitespace-pre-wrap break-words">{detail}</p>}
                {provider?.details?.imageDriverModel && <div>Codex 任务模型：{provider.details.imageDriverModel}</div>}
                {provider?.details?.imageDriverReasoning && <div>推理强度：{provider.details.imageDriverReasoning}</div>}
                {isCodex && <div>最多 5 张参考图。尺寸、质量和张数作为生成要求。</div>}
                {isAntigravity && <div>通过本机 Antigravity 的图片工具生成，模型版本由工具管理。</div>}
            </div>
        </details>}
    </div>;
}
