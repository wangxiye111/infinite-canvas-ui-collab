import { useEffect } from 'react';
import { Button, theme } from 'antd';
import { nanoid } from 'nanoid';
import { useLocalAccountStatus } from '@/hooks/use-local-account-status';
import { configureLocalAccount, localAccountStatus } from '@/lib/local-account-setup';
import { useConfigStore } from '@/stores/use-config-store';

export function LocalAccountStatus() {
    const accounts = useLocalAccountStatus();
    const { token } = theme.useToken();
    const [codex, google] = accounts;
    useEffect(() => {
        for (const account of [codex, google]) {
            if (!account.data || !localAccountStatus(account.data, account.error).ready) continue;
            const config = useConfigStore.getState().config;
            const next = configureLocalAccount(config, account.data, nanoid());
            if (JSON.stringify(next) !== JSON.stringify(config)) useConfigStore.setState({ config: next });
        }
    }, [codex.data, codex.error, google.data, google.error]);
    return <div className="flex flex-wrap items-center gap-1" aria-label="本机账号状态">
        {accounts.map(account => {
            const status = localAccountStatus(account.data, account.error);
            return <Button key={account.engine} type="text" size="small" onClick={() => useConfigStore.getState().openConfigDialog(false, 'local-cli')}>
                <span className="size-1.5 rounded-full" style={{ background: account.isFetching ? token.colorTextQuaternary : status.ready && !status.warning ? token.colorSuccess : token.colorWarning }} />
                {account.name} · {account.isFetching ? '检测中' : status.label}{status.ready && !account.isFetching && !account.data?.details?.imageDriverError ? account.data?.details?.imageAvailable ? ' · 生图可用' : ' · 生图不可用' : ''}{status.ready && account.data?.details?.agentAvailable === false ? ' · 对话服务未启动' : ''}
            </Button>;
        })}
    </div>;
}


