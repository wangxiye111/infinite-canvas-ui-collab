import { App, Button, Form, Input, Select, theme } from 'antd';
import { Save, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { localCliApi, localCliNames, type LocalCliEngine } from '@/services/api/local-cli';
import { useConfigStore, createModelChannel, modelOptionsFromChannels } from '@/stores/use-config-store';
import { useLocalCliProviders } from '@/hooks/use-local-cli-providers';
import { accountStatusKey } from '@/hooks/use-local-account-status';
import { LocalCliJobs } from '@/components/agent/local-cli-jobs';

export function ConfigLocalCli() {
    const { token } = theme.useToken();
    const { message } = App.useApp();
    const client = useQueryClient();
    const query = useLocalCliProviders();
    const engine = useConfigStore(state => state.localCliEngine);
    const provider = query.data?.find(item => item.id === engine);
    const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>({});
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        if (query.data) setDrafts(current => Object.fromEntries(query.data.map(item => [item.id, current[item.id] || item.config])));
    }, [query.data]);
    const save = async () => {
        if (!provider) return;
        setBusy(true);
        try {
            query.setProvider(await localCliApi.save(engine, drafts[engine] || {}));
            if (engine !== 'gemini-cli') await client.invalidateQueries({ queryKey: accountStatusKey(engine) });
            message.success('路径已保存，连接状态已更新');
        } catch (error) { message.error(error instanceof Error ? error.message : '保存失败'); }
        finally { setBusy(false); }
    };
    const addGemini = async () => {
        setBusy(true);
        try {
            const result = await localCliApi.check('gemini-cli');
            query.setProvider(result);
            if (result.state !== 'configured' && result.state !== 'ready') throw new Error(result.message);
            const store = useConfigStore.getState();
            if (!store.config.channels.some(channel => channel.apiFormat === 'gemini-cli')) {
                const channels = [...store.config.channels, createModelChannel({ name: localCliNames['gemini-cli'], apiFormat: 'gemini-cli', models: [{ name: 'default', capability: 'text' }] })];
                store.updateConfig('channels', channels);
                store.updateConfig('models', modelOptionsFromChannels(channels));
            }
            message.success('已添加文本模型，请在画布文本节点选择 Gemini CLI');
        } catch (error) { message.error(error instanceof Error ? error.message : '连接失败'); }
        finally { setBusy(false); }
    };
    return <div className="space-y-4 text-sm">
        <div className="space-y-2">
            <label className="block font-medium" htmlFor="local-cli-engine">本机工具路径</label>
            <p className="text-xs" style={{ color: token.colorTextSecondary }}>已安装但检测不到时，选择工具并填写可执行文件的完整路径；留空自动查找。</p>
            <Select<LocalCliEngine> id="local-cli-engine" className="w-full" value={engine} onChange={value => useConfigStore.setState({ localCliEngine: value })} options={Object.entries(localCliNames).map(([value, label]) => ({ value: value as LocalCliEngine, label }))} />
        </div>
        {query.error && <div role="alert"><p>本地连接服务不可用，请重新打开「无限画布」。</p><Button type="text" loading={query.isFetching} onClick={() => void query.refetch()}>重新检测</Button></div>}
        {provider && <Form layout="vertical" requiredMark={false}>
            {provider.fields.map(field => <Form.Item key={field.key} label={field.label} className="mb-3"><Input value={drafts[engine]?.[field.key] || ''} placeholder={String(provider.details?.[field.key] || field.placeholder || '留空自动检测')} onChange={event => setDrafts(items => ({ ...items, [engine]: { ...items[engine], [field.key]: event.target.value } }))} /></Form.Item>)}
            <Button type="text" icon={<Save size={14} />} loading={busy} onClick={() => void save()}>保存路径并检测</Button>
        </Form>}
        {engine === 'gemini-cli' && <div className="space-y-2">
            <p className="text-xs" style={{ color: token.colorTextSecondary }}>先按 <a href="https://geminicli.com/docs/get-started/" target="_blank" rel="noreferrer">官方说明</a> 安装 Gemini CLI，在终端运行 gemini 并选择 Google 登录。可以对话后，点击下方按钮将文本模型加入画布。</p>
            <Button type="text" icon={<RefreshCw size={14} />} loading={busy} onClick={() => void addGemini()}>检测并添加文本模型</Button>
            {provider && <p role="status" className="text-xs">{provider.message}</p>}
        </div>}
        <details><summary className="cursor-pointer">本地生成任务</summary><div className="pt-3"><LocalCliJobs /></div></details>
    </div>;
}
