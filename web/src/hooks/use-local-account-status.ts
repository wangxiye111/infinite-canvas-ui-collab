import { useQueries, useQueryClient } from '@tanstack/react-query';
import { localCliApi, type LocalAccountEngine } from '@/services/api/local-cli';

export const localAccounts = [{ engine: 'codex-cli', name: 'ChatGPT', tool: 'Codex' }, { engine: 'antigravity-cli', name: 'Google', tool: 'Antigravity' }] as const;
export const accountStatusKey = (engine: LocalAccountEngine) => ['local-account-status', engine];

// Checks login and model discovery only; never starts OAuth or generation.
export function useLocalAccountStatus() {
    const client = useQueryClient();
    const queries = useQueries({ queries: localAccounts.map(({ engine }) => ({
        queryKey: accountStatusKey(engine), retry: false, refetchOnMount: false,
        queryFn: async () => {
            const provider = await localCliApi.check(engine);
            if (engine === 'codex-cli') {
                try {
                    await localCliApi.bootstrapCodex();
                    provider.details = { ...provider.details, agentAvailable: true };
                } catch (error) {
                    provider.details = { ...provider.details, agentAvailable: false, agentMessage: error instanceof Error ? error.message : '对话服务不可用' };
                }
            }
            await client.invalidateQueries({ queryKey: ['local-cli-providers'] });
            return provider;
        },
    })) });
    return localAccounts.map((account, index) => ({ ...account, ...queries[index] }));
}
