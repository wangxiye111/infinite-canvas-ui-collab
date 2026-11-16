import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import * as onboarding from '../src/onboarding.mjs';

const ready = { state: 'ready', details: { loginState: 'authenticated', authMethod: 'chatgpt', imageAvailable: true } };
const signedOut = { state: 'configured', details: { loginState: 'not-authenticated' } };
async function finish(manager, id) {
  for (let i = 0; i < 50; i++) {
    const value = manager.get(id);
    if (value.status !== 'running') return value;
    await setImmediate();
  }
  throw new Error('Setup did not settle');
}
function fixture(overrides = {}) {
  let authenticated = false, logins = 0;
  const provider = { id: 'codex-cli', check: async () => authenticated ? ready : signedOut,
    login: async () => { logins++; authenticated = true; }, ...overrides };
  const manager = onboarding.createOnboarding({ providerById: id => { assert.equal(id, provider.id); return provider; }, getConfig: () => ({}), summarize: async (p, checked) => ({ id: p.id, ...checked }) });
  return { manager, logins: () => logins };
}
test('first connection logs in, verifies and returns capabilities; repeated clicks share the active task', async () => {
  const f = fixture();
  const first = f.manager.start('codex-cli');
  assert.equal(f.manager.start('codex-cli').id, first.id);
  const result = await finish(f.manager, first.id);
  assert.equal(result.status, 'succeeded');
  assert.equal(result.provider.details.imageAvailable, true);
  assert.equal(f.logins(), 1);
  assert.equal(f.manager.list()[0].id, first.id);
});
test('an authenticated account is reused without opening login', async () => {
  const f = fixture({ check: async () => ready });
  assert.equal((await finish(f.manager, f.manager.start('codex-cli').id)).status, 'succeeded');
  assert.equal(f.logins(), 0);
});
test('missing binary and unsuccessful authorization never report success', async () => {
  for (const state of [{ state: 'not-installed' }, signedOut]) {
    const f = fixture({ check: async () => state });
    assert.equal((await finish(f.manager, f.manager.start('codex-cli').id)).status, 'failed');
  }
});
test('cancelling an in-progress login prevents late success and permits retry', async () => {
  let release;
  const f = fixture({ login: async (_, __, { signal }) => new Promise(resolve => { release = resolve; signal.addEventListener('abort', resolve, { once: true }); }) });
  const task = f.manager.start('codex-cli');
  while (!release) await setImmediate();
  f.manager.cancel(task.id);
  release();
  await setImmediate();
  assert.equal(f.manager.get(task.id).status, 'cancelled');
  const next = f.manager.start('codex-cli');
  assert.notEqual(next.id, task.id);
  f.manager.cancel(next.id);
  await f.manager.close();
});
test('API-key login must go through membership login and unsupported providers are rejected', async () => {
  const f = fixture({ check: async () => ({ ...ready, details: { ...ready.details, authMethod: 'api-key' } }) });
  assert.equal((await finish(f.manager, f.manager.start('codex-cli').id)).status, 'failed');
  assert.equal(f.logins(), 1);
  assert.throws(() => f.manager.start('runninghub'));
});
