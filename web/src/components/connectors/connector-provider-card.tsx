import { Alert, App, Button, Input, Tag, Typography, theme } from "antd";
import { ArrowRight, ExternalLink, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { connectorsApi, connectorProviderNames, connectorStateLabels, CONNECTOR_POLL_INTERVAL_MS, type ConnectorLogin, type ConnectorProviderId } from "@/services/api/connectors";
import { useConnectorManagerStore, useConnectorsStore } from "@/stores/use-connectors-store";

const officialUrl = (value?: string) => value && /^https:\/\//i.test(value) ? value : undefined;
const guides: Partial<Record<ConnectorProviderId, string[]>> = {
    kling: ["准备可灵国内站账号和个人付费灵感值。打开官方说明，安装连接工具。", "点击「登录授权」，在打开的可灵页面完成登录；回到这里点击「查看授权结果」。", "点击「重新检查」。显示「已就绪」后，回到图片／视频节点，在底部模型菜单直接选择可灵。"],
    jimeng: ["准备有相应权益的即梦账号。打开官方说明，安装独立生成工具；全能画布版暂未接入。", "点击「登录授权」，再点击出现的「打开官方授权页面」确认授权；页面自动更新结果。", "点击「重新检查」。显示「已就绪」后，回到图片／视频节点，选择即梦模型和生成方式。"],
    runninghub: ["打开 RunningHub API 控制台，在「消费级-会员」找到已有 API 密钥。", "将密钥填入下方「API Key」，点击「保存并检查」。加密工作流另填访问密码。", "连接检查通过后，进入「任务预设」添加工作流或 AI 应用，填写标识、输入映射和输出类型。"],
};

export function ConnectorProviderCard({ id }: { id: ConnectorProviderId }) {
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const { token } = theme.useToken();
    const { message } = App.useApp();
    const provider = useConnectorsStore(state => state.providers.find(item => item.id === id));
    const loading = useConnectorsStore(state => state.loading);
    const setProvider = useConnectorsStore(state => state.setProvider);
    const setTab = useConnectorManagerStore(state => state.setTab);
    const closeManager = useConnectorManagerStore(state => state.closeManager);
    const [config, setConfig] = useState<Record<string, string>>({});
    const [busy, setBusy] = useState("");
    const [error, setError] = useState("");
    const [login, setLogin] = useState<ConnectorLogin | null>(null);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const lock = useRef(false);
    const savedConfig = JSON.stringify(provider?.config || {});
    useEffect(() => { setConfig(JSON.parse(savedConfig) as Record<string, string>); }, [id, savedConfig]);
    const run = async (action: string, task: () => Promise<void>) => {
        if (lock.current) return;
        lock.current = true;
        setBusy(action);
        setError("");
        try { await task(); }
        catch (cause) { setError(cause instanceof Error ? cause.message : "操作失败，请重试"); }
        finally { lock.current = false; setBusy(""); }
    };
    const check = async () => {
        const checked = await connectorsApi.checkProvider(id);
        setProvider(checked);
        if (checked.state === "error" || checked.state === "not-installed" || checked.state === "not-connected") setError(checked.message);
    };
    const saveAndCheck = () => run("save", async () => {
        setProvider(await connectorsApi.saveProvider(id, config));
        setConfig(current => Object.fromEntries(Object.entries(current).map(([key, value]) => [key, provider?.fields.find(field => field.key === key)?.secret ? "" : value])));
        await check();
    });
    const fields = provider?.fields.map(field => <label key={field.key} className="flex flex-col gap-1 text-xs">
        {field.label}
        {field.secret ? <Input.Password autoComplete="new-password" value={config[field.key] || ""} disabled={Boolean(busy)} placeholder={provider.configuredFields?.includes(field.key) ? "已保存；留空保留原值" : field.placeholder || "请输入凭据"} onChange={event => setConfig({ ...config, [field.key]: event.target.value })} />
            : <Input value={config[field.key] || ""} disabled={Boolean(busy)} placeholder={field.placeholder} onChange={event => setConfig({ ...config, [field.key]: event.target.value })} />}
    </label>);
    const waiting = login?.status === "running";
    useEffect(() => {
        if (!login || login.status !== "running") return;
        let cancelled = false;
        const timer = window.setTimeout(() => {
            void connectorsApi.loginStatus(login.id).then(async result => {
                if (cancelled) return;
                setLogin(result);
                if (result.status === "succeeded") await check();
            }).catch(cause => { if (!cancelled) setError(cause instanceof Error ? cause.message : "授权状态读取失败，请点击查看授权结果"); });
        }, CONNECTOR_POLL_INTERVAL_MS);
        return () => { cancelled = true; window.clearTimeout(timer); };
        // Reuse the existing task polling cadence; this never submits a generation.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [login]);
    const unsaved = Boolean(provider?.fields.some(field => field.secret ? Boolean(config[field.key]) : (config[field.key] || "") !== (provider.config[field.key] || "")));
    const ready = provider?.state === "ready";
    const configured = provider?.state === "configured";
    const directGeneration = id === "kling" || id === "jimeng";
    const loginAction = () => run("login", async () => {
        const result = await connectorsApi.login(id);
        setLogin({ id: result.loginId, status: result.status, message: result.message });
    });
    return <section className="flex min-w-0 flex-col gap-4 rounded-xl border p-5" style={{ borderColor: token.colorBorderSecondary }} aria-label={`${connectorProviderNames[id]}连接`}>
        <div className="flex items-center justify-between gap-3">
            <h3 className="m-0 text-base font-semibold">{connectorProviderNames[id]}</h3>
            <Tag className="m-0" color={ready ? "success" : provider?.state === "error" ? "error" : "default"}>{ready ? "已就绪" : configured ? "已配置" : provider?.state === "not-installed" ? "待安装" : provider ? connectorStateLabels[provider.state] : loading ? "检测中" : "服务未连接"}</Tag>
        </div>
        <p role="status" className="m-0 text-sm leading-6" style={{ color: token.colorTextSecondary }}>
            {ready ? directGeneration ? "可在图片／视频节点直接选择模型生成。" : "连接已通过检查，可配置生成预设。" : configured ? "配置已保存，额度与实际可用性以平台结果为准。" : provider?.message || (loading ? "正在读取平台连接状态…" : "请从本机应用入口启动画布，再刷新平台状态。")}
        </p>
        <div className="flex flex-wrap items-center gap-1">
            {ready || configured ? <Button type="text" style={{ color: token.colorPrimary, fontWeight: 600 }} icon={<ArrowRight className="size-4" />} onClick={() => {
                if (!directGeneration) return setTab("presets");
                closeManager();
                if (!pathname.startsWith('/canvas')) navigate('/canvas');
            }}>{directGeneration ? "返回画布使用" : "配置生成预设"}</Button>
                : provider?.auth === "cli" && provider.state === "not-connected" ? <Button type="text" style={{ color: token.colorPrimary, fontWeight: 600 }} disabled={Boolean(busy) || waiting || unsaved} loading={busy === "login"} onClick={() => void loginAction()}>登录授权</Button>
                    : <Button type="text" style={{ color: token.colorPrimary, fontWeight: 600 }} disabled={!provider} onClick={() => setSettingsOpen(true)}>{provider?.state === "not-installed" ? "查看安装步骤" : provider?.state === "error" ? "检查连接设置" : "连接平台"}</Button>}
            {provider && provider.state !== "not-installed" && <Button type="text" size="small" disabled={Boolean(busy) || waiting || unsaved} loading={busy === "check"} icon={<RefreshCw className="size-3.5" />} onClick={() => void run("check", check)}>重新检查</Button>}
        </div>
        {login && <div className="flex flex-col items-start gap-2 text-xs" aria-live="polite">
            <span>{login.status === "running" ? "等待授权" : login.status === "succeeded" ? "授权已完成" : "授权未完成"}：{login.message}</span>
            {waiting && officialUrl(login.url) && <Typography.Link href={login.url} target="_blank" rel="noopener noreferrer">打开官方授权页面</Typography.Link>}
            {waiting && login.code && <span>授权码：<Typography.Text copyable>{login.code}</Typography.Text></span>}
            {waiting && <Button type="text" size="small" disabled={Boolean(busy)} loading={busy === "loginStatus"} onClick={() => void run("loginStatus", async () => {
                const result = await connectorsApi.loginStatus(login.id);
                setLogin(result);
                if (result.status === "succeeded") { message.success(`${connectorProviderNames[id]}授权完成，正在检查连接`); await check(); }
            })}>查看授权结果</Button>}
        </div>}
        {provider && <details open={settingsOpen} onToggle={event => setSettingsOpen(event.currentTarget.open)} className="border-t pt-3 text-xs" style={{ borderColor: token.colorBorderSecondary }}>
            <summary className="cursor-pointer" style={{ color: token.colorTextSecondary }}>{ready || configured ? "连接设置与使用说明" : "连接步骤与设置"}{unsaved ? " · 有未保存修改" : ""}</summary>
            <div className="mt-4 flex flex-col gap-4">
                {guides[id] && <ol className="m-0 list-decimal space-y-2 pl-4 leading-6" style={{ color: token.colorTextSecondary }}>{guides[id]!.map(step => <li key={step}>{step}</li>)}</ol>}
                <div className="flex flex-wrap gap-1">
                    {officialUrl(provider.docs) && <Button type="text" size="small" href={provider.docs} target="_blank" rel="noopener noreferrer" icon={<ExternalLink className="size-3.5" />}>官方说明</Button>}
                    {id === "runninghub" && <Button type="text" size="small" href="https://www.runninghub.cn/call-api" target="_blank" rel="noopener noreferrer">API 控制台</Button>}
                </div>
                {id === "kling" && <p className="m-0 leading-6">安装 Node.js 后，在 Windows 的 PowerShell 或 macOS 的终端执行：<br /><Typography.Text code copyable>npm install -g @klingai/cli-cn --registry=https://registry.npmjs.org</Typography.Text><br />安装完成后点击「重新检测安装」，再按上方步骤授权。</p>}
                {id === "jimeng" && <p className="m-0 leading-6">从「官方说明」下载对应系统的独立 <code>dreamina</code> 工具，将工具路径填在下方并点击「保存位置并检查」，再登录授权。此处不支持 <code>dreamina-canvas</code>。</p>}
                {fields}
                {unsaved && <p className="m-0" style={{ color: token.colorTextSecondary }}>配置已修改，请先保存并检查。</p>}
                <div className="flex flex-wrap gap-1">
                    <Button type="text" style={{ color: token.colorPrimary, fontWeight: 600 }} loading={busy === "save"} disabled={Boolean(busy) || waiting} onClick={() => void saveAndCheck()}>{provider.auth === "cli" ? "保存位置并检查" : "保存并检查"}</Button>
                    {provider.auth === "cli" && <>
                        <Button type="text" disabled={Boolean(busy) || waiting || unsaved} loading={busy === "detect"} onClick={() => void run("detect", async () => { setProvider(await connectorsApi.detectProvider(id)); })}>重新检测安装</Button>
                        <Button type="text" disabled={Boolean(busy) || waiting || unsaved || provider.state === "not-installed"} loading={busy === "login"} onClick={() => void loginAction()}>登录授权</Button>
                    </>}
                </div>
                {provider.billing && <p className="m-0 leading-5" style={{ color: token.colorTextSecondary }}>{provider.billing}</p>}
                <details><summary className="cursor-pointer">查看检查详情</summary><p className="leading-5">{provider.message}</p>{provider.details !== undefined && <pre className="max-h-52 overflow-auto whitespace-pre-wrap break-all">{JSON.stringify(provider.details, null, 2)}</pre>}</details>
            </div>
        </details>}
        {error && <Alert type="error" title={error} showIcon />}
    </section>;
}
