import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ensureDevelopmentAgent } from '../../start-dev-agent.mjs';

test('development startup reuses healthy configured Agent without launching or stopping it', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'canvas-dev-agent-'));
  try {
    const configFile = join(dir, 'agent.json');
    await writeFile(configFile, JSON.stringify({ url: 'http://127.0.0.1:19400', token: 'private' }));
    let launches = 0;
    const result = await ensureDevelopmentAgent({ root: dir, configFile, env: {}, fetcher: async url => {
      assert.equal(String(url), 'http://127.0.0.1:19400/health');
      return { ok: true, json: async () => ({ ok: true, protocolVersion: 6 }) };
    }, spawn: () => { launches++; } });
    assert.equal(launches, 0);
    assert.equal(result.reused, true);
    await result.close();
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('unhealthy occupied port and invalid config never cause an Agent launch', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'canvas-dev-agent-'));
  try {
    const configFile = join(dir, 'agent.json');
    await writeFile(configFile, JSON.stringify({ url: 'http://127.0.0.1:19400' }));
    const options = { root: dir, configFile, env: {}, spawn: () => assert.fail('must not launch'), fetcher: async () => ({ ok: true, json: async () => ({ ok: true }) }) };
    await assert.rejects(ensureDevelopmentAgent(options), /健康检查/);
    await writeFile(configFile, '{');
    await assert.rejects(ensureDevelopmentAgent(options));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('missing Agent starts hidden, redacts credentials, and closes only its own child', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'canvas-dev-agent-'));
  try {
    const configFile = join(dir, 'agent.json');
    await writeFile(configFile, JSON.stringify({ url: 'http://127.0.0.1:19400', token: 'private-token' }));
    let calls = 0, killed = false;
    const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), exitCode: null, signalCode: null, kill() { killed = true; this.exitCode = 0; this.stdout.end(); this.stderr.end(); this.emit('close', 0); } });
    const result = await ensureDevelopmentAgent({ root: dir, configFile, env: {}, fetcher: async () => {
      if (!calls++) throw Object.assign(new Error('offline'), { cause: { code: 'ECONNREFUSED' } });
      return { ok: true, json: async () => ({ ok: true, protocolVersion: 6 }) };
    }, spawn: (_, args, options) => {
      assert.deepEqual(args, ['--import', 'tsx', 'src/index.ts']);
      assert.equal(options.windowsHide, true);
      assert.equal(options.env.CANVAS_AGENT_HIDE_TOKEN, '1');
      setImmediate(() => child.stdout.write('Infinite Canvas Agent\nConnect token: private-token\n'));
      return child;
    } });
    assert.equal(result.reused, false);
    await result.close();
    assert.equal(killed, true);
    assert.doesNotMatch(await readFile(join(dir, 'logs/dev-agent.log'), 'utf8'), /private-token/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
