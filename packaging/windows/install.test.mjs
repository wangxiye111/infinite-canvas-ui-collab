import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cliEntry } from '../../canvas-connectors/src/cli-process.mjs';

test('the packaged Codex shim resolves to JS so prompts and quoted arguments bypass CMD parsing', { skip: process.platform !== 'win32' }, () => {
    const target = cliEntry(join(dirname(fileURLToPath(import.meta.url)), 'codex.cmd'));
    assert.ok(target.endsWith(join('canvas-agent', 'node_modules', '@openai', 'codex', 'bin', 'codex.js')));
});

test('Windows installer checks payload hashes, supports Chinese paths and preserves other releases', { skip: process.platform !== 'win32' }, async () => {
    const root = await mkdtemp(join(tmpdir(), 'canvas-install-test-'));
    const bundle = join(root, '安装 包');
    const payload = join(bundle, 'payload');
    const destination = join(root, '用户 安装');
    await mkdir(payload, { recursive: true });
    const bytes = Buffer.from('fresh installation test');
    await writeFile(join(payload, 'fixture.txt'), bytes);
    await writeFile(join(payload, 'manifest.json'), JSON.stringify({ product: 'infinite-canvas', id: 'test-release', files: [{ path: 'fixture.txt', sha256: createHash('sha256').update(bytes).digest('hex') }] }));
    await writeFile(join(bundle, 'install.ps1'), Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), await readFile(join(dirname(fileURLToPath(import.meta.url)), 'install.ps1'))]));
    await mkdir(join(destination, 'releases', 'old'), { recursive: true });
    await writeFile(join(destination, 'releases', 'old', 'keep.txt'), 'previous installation');
    const install = () => spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(bundle, 'install.ps1'), '-Quiet', '-NoLaunch', '-NoShortcuts', '-Destination', destination], { windowsHide: true, encoding: 'utf8', env: { ...process.env, PSModulePath: join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/Modules') } });
    for (let i = 0; i < 2; i++) { const result = install(); assert.equal(result.status, 0, result.stderr); }
    assert.equal(await readFile(join(destination, 'releases/test-release/fixture.txt'), 'utf8'), 'fresh installation test');
    assert.equal(await readFile(join(destination, 'releases/old/keep.txt'), 'utf8'), 'previous installation');
    await writeFile(join(payload, 'fixture.txt'), 'tampered');
    assert.notEqual(install().status, 0);
    assert.equal(await readFile(join(destination, 'releases/test-release/fixture.txt'), 'utf8'), 'fresh installation test');
});
