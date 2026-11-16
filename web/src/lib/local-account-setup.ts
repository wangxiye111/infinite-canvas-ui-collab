import type { AiConfig, ModelChannel, ModelCapability } from '@/stores/use-config-store';
import type { LocalCliProvider } from '@/services/api/local-cli';
import { antigravityImageConnection, codexImageConnection, LOCAL_ANTIGRAVITY_IMAGE_MODEL, LOCAL_CODEX_IMAGE_MODEL } from './local-cli-image-setup';

export function localAccountStatus(provider?: LocalCliProvider, error?: Error | null) {
    if (error) return { ready: false, label: '服务不可用' };
    if (!provider) return { ready: false, label: '检测中' };
    if (provider.state === 'not-installed') return { ready: false, label: '未安装' };
    if (provider.details?.loginState === 'authenticated' && (provider.id !== 'codex-cli' || provider.details.authMethod === 'chatgpt')) return { ready: true, label: provider.details.imageDriverError ? '模型检测失败' : '已连接', warning: Boolean(provider.details.imageDriverError || provider.details.imageDriverWarning) };
    if (provider.details?.loginState === 'not-authenticated') return { ready: false, label: '未登录' };
    return { ready: false, label: provider.details?.authMethod === 'api-key' ? '需登录 ChatGPT' : '连接待检查' };
}

/** One account produces one channel; preserve any usable defaults the user already chose. */
export function configureLocalAccount(config: AiConfig, provider: LocalCliProvider, channelId: string): AiConfig {
    const codex = provider.id === 'codex-cli';
    if ((!codex && provider.id !== 'antigravity-cli') || provider.details?.loginState !== 'authenticated' || (codex && provider.details.authMethod !== 'chatgpt')) throw new Error('请先完成账号登录。');
    const imageName = codex ? LOCAL_CODEX_IMAGE_MODEL : LOCAL_ANTIGRAVITY_IMAGE_MODEL;
    const imageReady = (codex ? codexImageConnection(provider) : antigravityImageConnection(provider)).code === 'available';
    const existing = config.channels.find(c => c.apiFormat === provider.id && !c.models.some(m => (m.name === 'default' && m.capability !== 'text') || (m.name === imageName && m.capability !== 'image')));
    const channel: ModelChannel = { ...(existing || { id: channelId, name: codex ? 'ChatGPT（本机 Codex）' : 'Google（本机 Antigravity）', apiFormat: provider.id, apiKey: '', baseUrl: '' }), models: [...(existing?.models || [])] };
    if (!channel.models.some(m => m.name === 'default')) channel.models.push({ name: 'default', capability: 'text' });
    if (imageReady && !channel.models.some(m => m.name === imageName)) channel.models.push({ name: imageName, capability: 'image' });
    const channels = existing ? config.channels.map(c => c === existing ? channel : c) : [...config.channels, channel];
    const usable = (value: string, capability: ModelCapability) => channels.some(c => (c.apiFormat.endsWith('-cli') || c.baseUrl.trim() && c.apiKey.trim()) && c.models.some(m => `${c.id}::${m.name}` === value && m.capability === capability));
    const imageModel = usable(config.imageModel, 'image') || !imageReady ? config.imageModel : `${channel.id}::${imageName}`;
    return { ...config, channels, models: channels.flatMap(c => c.models.map(m => `${c.id}::${m.name}`)),
        textModel: usable(config.textModel, 'text') ? config.textModel : `${channel.id}::default`, imageModel,
        model: usable(config.model, 'image') || !imageReady ? config.model : imageModel };
}
