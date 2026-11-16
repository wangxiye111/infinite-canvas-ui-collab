import { useEffect, useRef, useState } from 'react';
import { App, Button, theme } from 'antd';
import { Check, ExternalLink, MessageSquare, ImagePlus } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { nanoid } from 'nanoid';
import { localCliApi, type LocalAccountEngine, type LocalAccountSetup } from '@/services/api/local-cli';
import { configureLocalAccount, localAccountStatus } from '@/lib/local-account-setup';
import { accountStatusKey, useLocalAccountStatus } from '@/hooks/use-local-account-status';
import { LOCAL_CODEX_IMAGE_MODEL, LOCAL_ANTIGRAVITY_IMAGE_MODEL } from '@/lib/local-cli-image-setup';
import { useConfigStore } from '@/stores/use-config-store';
import { useAgentStore } from '@/stores/use-agent-store';
import { useLocalCliAgentStore } from '@/stores/use-local-cli-agent-store';

const key = ['local-account-setup'];
const accounts = [{ engine: 'codex-cli', name: 'ChatGPT', tool: 'Codex' }, { engine: 'antigravity-cli', name: 'Google', tool: 'Antigravity' }] as const;

export function LocalAccountSetupView() {
    const { token } = theme.useToken();
    const { message } = App.useApp();
    const navigate = useNavigate();
    const client = useQueryClient();
    const statuses = useLocalAccountStatus();
    const applied = useRef(new Set<string>());
    const [busy, setBusy] = useState<LocalAccountEngine>();
    const [errors, setErrors] = useState<Partial<Record<LocalAccountEngine, string>>>({});
    const query = useQuery({ queryKey: key, queryFn: localCliApi.setups, retry: false,
        refetchInterval: q => q.state.data?.some(t => t.status === 'running') ? 2500 : false });
    const update = (task: LocalAccountSetup) => client.setQueryData<LocalAccountSetup[]>(key, (items = []) => [...items.filter(t => t.id !== task.id), task]);

    useEffect(() => {
        const latest = new Map((query.data || []).map(t => [t.engine, t]));
        for (const task of latest.values()) {
            if (task.status !== 'succeeded' || !task.provider || applied.current.has(task.id)) continue;
            applied.current.add(task.id);
            void (async () => {
                try {
                    const store = useConfigStore.getState();
                    useConfigStore.setState({ config: configureLocalAccount(store.config, task.provider!, nanoid()) });
                    await client.invalidateQueries({ queryKey: accountStatusKey(task.engine) });
                    await client.invalidateQueries({ queryKey: ['local-cli-providers'] });
                    if (task.engine === 'codex-cli') {
                        const connection = await localCliApi.bootstrapCodex();
                        useAgentStore.getState().setAgentState({ url: connection.url, token: connection.token, activeTab: 'chat' });
                        useAgentStore.getState().connectAgent();
                    }
                } catch (cause) {
                    setErrors(current => ({ ...current, [task.engine]: cause instanceof Error ? cause.message : '配置未完成，请重新连接。' }));
                }
            })();
        }
    }, [query.data, client]);

    const connect = async (engine: LocalAccountEngine) => {
        if (busy) return;
        setBusy(engine);
        setErrors(current => ({ ...current, [engine]: undefined }));
        try { update(await localCliApi.connectAccount(engine)); }
        catch (cause) { setErrors(current => ({ ...current, [engine]: cause instanceof Error ? cause.message : '连接失败，请重试。' })); }
        finally { setBusy(undefined); }
    };
    const cancel = async (task: LocalAccountSetup) => {
        try { update(await localCliApi.cancelSetup(task.id)); }
        catch { message.error('取消失败，请重试。'); }
    };
    const open = async (engine: LocalAccountEngine, image: boolean) => {
        if (!image && engine === 'codex-cli') {
            try {
                const connection = await localCliApi.bootstrapCodex();
                useAgentStore.getState().setAgentState({ url: connection.url, token: connection.token, activeTab: 'chat' });
                useAgentStore.getState().connectAgent();
            } catch (cause) {
                setErrors(current => ({ ...current, [engine]: cause instanceof Error ? cause.message : '对话连接失败' }));
                return;
            }
        }
        const store = useConfigStore.getState();
        store.setConfigDialogOpen(false);
        if (image) {
            const channel = store.config.channels.find(c => c.apiFormat === engine);
            if (channel) store.updateConfig('imageModel', `${channel.id}::${engine === 'codex-cli' ? LOCAL_CODEX_IMAGE_MODEL : LOCAL_ANTIGRAVITY_IMAGE_MODEL}`);
            navigate('/image');
        } else {
            useLocalCliAgentStore.getState().setEngine(engine);
            navigate('/canvas');
            useAgentStore.getState().openPanel();
        }
    };
    return <div className="space-y-5">
        <div className="space-y-1">
            <h2 className="text-base font-medium">连接你的 AI 账号</h2>
            <p className="text-sm" style={{ color: token.colorTextSecondary }}>准备好 ChatGPT 或 Google 账号，点击「连接」完成官方登录。检测成功后，模型会自动加入画布。</p>
        </div>
        {query.error && <div role="alert" className="space-y-2 text-sm" style={{ color: token.colorTextSecondary }}>
            <p>请先安装 Windows 版，并从桌面的「无限画布」打开。已安装的用户，重新打开后点击下方按钮。</p>
            <Button type="text" onClick={() => void query.refetch()} loading={query.isFetching}>重新检测连接助手</Button>
            <details className="text-xs"><summary>查看详情</summary>{String(query.error)}</details>
        </div>}
        <div className="grid gap-4 sm:grid-cols-2">
            {accounts.map(({ engine, name, tool }) => {
                const status = statuses.find(item => item.engine === engine)!;
                const task = query.data?.filter(t => t.engine === engine).at(-1);
                const running = task?.status === 'running';
                const provider = status.data || task?.provider;
                const state = localAccountStatus(provider, status.error);
                const ready = state.ready;
                const failure = errors[engine] || status.error?.message || (!ready && task?.status === 'failed' ? task.message : '');
                return <section key={engine} className="flex flex-col gap-4 rounded-xl border p-5" style={{ borderColor: token.colorBorderSecondary, background: token.colorBgContainer }} aria-label={`连接 ${name}`}>
                    <div className="flex items-start justify-between gap-2"><div><div className="text-base font-semibold">{name}</div><div className="mt-1 text-xs" style={{ color: token.colorTextSecondary }}>通过本机 {tool} 使用</div></div><span role="status" className="flex items-center gap-1 text-xs" style={{ color: state.warning ? token.colorWarning : ready ? token.colorSuccess : token.colorTextSecondary }}>{ready && <Check size={14} />}{running ? '连接中' : status.isFetching ? '检测中' : state.label}</span></div>
                    <div className="space-y-2 text-sm" style={{ color: token.colorTextSecondary }}>
                        <div className="flex justify-between"><span>账号</span><span>{ready ? '已登录' : state.label}</span></div>
                        <div className="flex justify-between"><span>图片模型</span><span>{provider?.details?.imageDriverError ? '检测失败，请重新检测' : provider?.details?.imageAvailable ? '已检测到' : ready ? '暂不可用' : '等待连接'}</span></div>
                        <div className="flex justify-between"><span>对话</span><span>{provider?.details?.agentAvailable === false ? '服务未启动' : ready ? '可以连接' : '等待连接'}</span></div>
                    </div>
                    {running && <p role="status" className="text-sm">{task.message}</p>}
                    {failure && <p role="alert" className="break-words text-sm" style={{ color: token.colorError }}>{failure}</p>}
                    {!failure && provider?.details?.agentAvailable === false && <p className="text-xs" style={{ color: token.colorWarning }}>对话服务未启动，请重新打开「无限画布」后检测。图片功能可单独使用。</p>}
                    <div className="flex flex-wrap gap-1">
                        <Button type="primary" loading={running || busy === engine || status.isFetching} disabled={Boolean(query.error) || Boolean(busy)} onClick={() => {
                            if (!ready) return void connect(engine);
                            setErrors(current => ({ ...current, [engine]: undefined }));
                            void status.refetch();
                        }}>{ready ? '重新检测' : `连接 ${name}`}</Button>
                        {running && task && <Button type="text" onClick={() => void cancel(task)}>取消</Button>}
                        {running && task?.url && <Button type="text" href={task.url} target="_blank" rel="noreferrer" icon={<ExternalLink size={14} />}>打开登录页</Button>}
                        {ready && <Button type="text" icon={<MessageSquare size={14} />} onClick={() => open(engine, false)}>开始对话</Button>}
                        {ready && provider?.details?.imageAvailable && <Button type="text" icon={<ImagePlus size={14} />} onClick={() => void open(engine, true)}>去生图</Button>}
                    </div>
                    {provider && <details className="mt-auto text-xs" style={{ color: token.colorTextSecondary }}><summary className="cursor-pointer">连接详情</summary><p className="mt-2 break-words">{provider.details?.imageMessage || provider.message}</p>{provider.details?.imageDriverWarning ? <p className="mt-2">{String(provider.details.imageDriverWarning)}</p> : null}{provider.details?.agentMessage ? <p className="mt-2">{String(provider.details.agentMessage)}</p> : null}</details>}
                </section>;
            })}
        </div>
    </div>;
}

