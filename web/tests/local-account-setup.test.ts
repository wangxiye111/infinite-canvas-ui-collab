import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as setup from '../src/lib/local-account-setup.ts';
import type { AiConfig } from '../src/stores/use-config-store.ts';
import type { LocalCliProvider } from '../src/services/api/local-cli.ts';

const config = () => ({ channels: [{ id: 'default', name: 'API', apiFormat: 'openai', baseUrl: 'https://api.openai.com', apiKey: '', models: [{ name: 'placeholder', capability: 'image' }] }], models: [], imageModel: 'default::placeholder', textModel: '', model: 'default::placeholder' }) as AiConfig;
const provider = (id = 'codex-cli') => ({ id, state: 'ready', actions: [{ id: 'text', output: 'text' }, { id: 'image', output: 'image' }], details: { loginState: 'authenticated', authMethod: 'chatgpt', imageAvailable: true, imageAdapter: id === 'codex-cli' ? 'codex-native' : 'antigravity-acp', imageDriverState: 'available', imageDriverSource: 'official-model-list', imageDriverModel: 'official-default', imageDriverReasoning: 'low' } }) as LocalCliProvider;
test('first connection adds text and image and replaces unusable placeholder defaults', () => {
  const result = setup.configureLocalAccount(config(), provider(), 'chatgpt');
  assert.equal(result.textModel, 'chatgpt::default');
  assert.equal(result.imageModel, 'chatgpt::codex-image-default');
  assert.deepEqual(result.channels[1].models.map(m => m.capability), ['text', 'image']);
  assert.equal(result.channels[0].apiKey, '');
});
test('connecting Google preserves working defaults and reconnect is idempotent', () => {
  const initial = setup.configureLocalAccount(config(), provider(), 'chatgpt');
  const both = setup.configureLocalAccount(initial, provider('antigravity-cli'), 'google');
  const repeated = setup.configureLocalAccount(both, provider('antigravity-cli'), 'unused');
  assert.deepEqual(repeated, both);
  assert.equal(both.channels.length, 3);
  assert.equal(both.imageModel, initial.imageModel);
  assert.equal(both.textModel, initial.textModel);
  assert.ok(both.models.includes('google::antigravity-image-default'));
});
test('text-only authorization adds no image model and unauthenticated/API-key setup is rejected', () => {
  const p = provider();
  p.details!.imageAvailable = false;
  const result = setup.configureLocalAccount(config(), p, 'text');
  assert.deepEqual(result.channels[1].models, [{ name: 'default', capability: 'text' }]);
  p.details!.loginState = 'not-authenticated';
  assert.throws(() => setup.configureLocalAccount(config(), p, 'bad'));
  p.details!.loginState = 'authenticated'; p.details!.authMethod = 'api-key';
  assert.throws(() => setup.configureLocalAccount(config(), p, 'bad'));
});

test('account status separates login and image readiness from an absent setup history', () => {
  assert.equal(setup.localAccountStatus(provider()).label, '已连接');
  assert.equal(setup.localAccountStatus({ ...provider(), details: { loginState: 'not-authenticated' } }).label, '未登录');
  assert.equal(setup.localAccountStatus(provider(), new Error('offline')).label, '服务不可用');
  assert.equal(setup.localAccountStatus(undefined).label, '检测中');
});

test('model discovery failure keeps authenticated account but reports warning, not absent capability', () => {
  const checked = provider();
  checked.details = { ...checked.details, imageAvailable: false, imageDriverError: 'network' };
  const result = setup.localAccountStatus(checked);
  assert.equal(result.ready, true);
  assert.equal(result.warning, true);
  assert.equal(result.label, '模型检测失败');
});
