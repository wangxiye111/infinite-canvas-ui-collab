import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { configureLocalAccount, localAccountStatus } from '../src/lib/local-account-setup.ts';

const all = node => Array.isArray(node) ? node.flatMap(all) : node && typeof node === 'object' ? [node, ...all(node.props?.children)] : [];
const button = (tree, text) => all(tree).find(n => n.type === 'Button' && n.props.children === text);
const flush = () => new Promise(resolve => setImmediate(resolve));
function mount() {
    const state = { config: { channels: [], models: [], imageModel: '', textModel: '', model: '' } };
    const calls = [], slots = [], effects = [];
    const statuses = ['codex-cli', 'antigravity-cli'].map(engine => ({ engine, data: undefined, error: null, refetch: async () => {} }));
    let cursor = 0;
    const query = { data: [], error: null };
    const client = { setQueryData: (_, update) => { query.data = update(query.data); }, invalidateQueries: async () => {} };
    const react = {
        useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
        useRef(initial) { const i = cursor++; return slots[i] ||= { current: initial }; },
        useEffect(effect, deps) { const i = cursor++; if (!slots[i] || deps.some((d, j) => d !== slots[i][j])) effects.push(effect); slots[i] = deps; },
    };
    const jsx = (type, props) => ({ type, props });
    const imports = {
        react, 'react/jsx-runtime': { jsx, jsxs: jsx }, antd: { App: { useApp: () => ({ message: { error: text => calls.push(['error', text]) } }) }, Button: 'Button', theme: { useToken: () => ({ token: {} }) } },
        'lucide-react': {}, 'react-router-dom': { useNavigate: () => () => {} }, nanoid: { nanoid: () => 'channel-1' },
        '@tanstack/react-query': { useQuery: () => query, useQueryClient: () => client },
        '@/lib/local-account-setup': { configureLocalAccount, localAccountStatus }, '@/lib/local-cli-image-setup': {},
        '@/hooks/use-local-account-status': { useLocalAccountStatus: () => statuses, accountStatusKey: engine => ['local-account-status', engine] },
        '@/stores/use-config-store': { useConfigStore: { getState: () => state, setState: patch => Object.assign(state, patch) } },
        '@/stores/use-agent-store': { useAgentStore: { getState: () => ({ setAgentState: value => calls.push(['agent', value]), connectAgent: () => calls.push(['connectAgent']) }) } },
        '@/stores/use-local-cli-agent-store': {},
        '@/services/api/local-cli': { localCliApi: {
            connectAccount: async engine => { calls.push(['connectAccount', engine]); return { id: 'task-1', engine, status: 'running', step: 'login', message: '请登录' }; },
            cancelSetup: async id => { calls.push(['cancelSetup', id]); return { id, engine: 'codex-cli', status: 'cancelled', message: '已取消连接' }; },
            bootstrapCodex: async () => ({ url: 'http://127.0.0.1:17371', token: 'test-token' }),
        } },
    };
    const exports = {};
    const source = ts.transpileModule(readFileSync(new URL('../src/components/layout/local-account-setup.tsx', import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    vm.runInNewContext(source, { exports, require: name => imports[name], Error, Map, Set });
    return { state, calls, query, statuses, render() { cursor = 0; const tree = exports.LocalAccountSetupView(); effects.splice(0).forEach(fn => fn()); return tree; } };
}
test('one click starts account flow; successful polling registers both models and connects the chat Agent exactly once', async () => {
    const ui = mount();
    assert.equal(ui.calls.length, 0);
    await button(ui.render(), '连接 ChatGPT').props.onClick();
    await flush();
    assert.equal(ui.query.data[0].status, 'running');
    ui.query.data = [{ id: 'task-1', engine: 'codex-cli', status: 'succeeded', message: '已连接', provider: {
        id: 'codex-cli', state: 'ready', actions: [{ id: 'image', output: 'image' }], details: { loginState: 'authenticated', authMethod: 'chatgpt', imageAvailable: true, imageAdapter: 'codex-native', imageDriverState: 'available', imageDriverSource: 'official-model-list', imageDriverModel: 'official-model', imageDriverReasoning: 'low' },
    } }];
    ui.render(); await flush();
    const tree = ui.render();
    assert.equal(ui.state.config.channels.length, 1);
    assert.equal(ui.state.config.imageModel, 'channel-1::codex-image-default');
    assert.equal(ui.state.config.textModel, 'channel-1::default');
    assert.ok(button(tree, '开始对话'));
    assert.ok(button(tree, '去生图'));
    assert.equal(ui.calls.filter(c => c[0] === 'connectAgent').length, 1);
});
test('login cancellation offers reconnect and never adds a channel', async () => {
    const ui = mount();
    await button(ui.render(), '连接 ChatGPT').props.onClick();
    await flush();
    await button(ui.render(), '取消').props.onClick();
    await flush();
    assert.equal(ui.query.data[0].status, 'cancelled');
    assert.ok(button(ui.render(), '连接 ChatGPT'));
    assert.equal(ui.state.config.channels.length, 0);
});

test('current login survives empty setup history and Agent outage does not hide available images', () => {
    const ui = mount();
    ui.statuses[0].data = { id: 'codex-cli', state: 'ready', details: { loginState: 'authenticated', authMethod: 'chatgpt', imageAvailable: true, agentAvailable: false } };
    const tree = ui.render();
    assert.ok(button(tree, '重新检测'));
    assert.ok(button(tree, '去生图'));
    assert.ok(all(tree).some(node => node.type === 'span' && node.props.children === '服务未启动'));
    assert.equal(ui.calls.length, 0);
});

test('verified Google login supersedes a historical failed login task', () => {
    const ui = mount();
    ui.query.data = [{ id: 'old-login', engine: 'antigravity-cli', status: 'failed', message: 'Google 登录未完成，请在官方页面检查后重新登录' }];
    ui.statuses[1].data = { id: 'antigravity-cli', state: 'ready', details: { loginState: 'authenticated', imageAvailable: true } };
    const tree = ui.render();
    assert.ok(button(tree, '去生图'));
    assert.equal(all(tree).some(node => node.props?.role === 'alert' && node.props.children === ui.query.data[0].message), false);
});
