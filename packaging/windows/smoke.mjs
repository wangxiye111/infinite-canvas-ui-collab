import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, delimiter } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { stopCli } from '../../canvas-connectors/src/cli-process.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const build = JSON.parse(await readFile(join(root, 'artifacts/windows/latest-build.json'), 'utf8'));
const scratch = await mkdtemp(join(tmpdir(), 'canvas-package-smoke-'));
const destination = join(scratch, '新用户 安装');
const profile = join(scratch, '全新账号');
await mkdir(profile);
const installed = join(destination, 'releases', build.id);
const env = { ...process.env, USERPROFILE: profile, HOME: profile, LOCALAPPDATA: join(profile, 'AppData/Local'), APPDATA: join(profile, 'AppData/Roaming'), CODEX_HOME: join(profile, '.codex'), CANVAS_AGENT_HIDE_TOKEN: '1', CANVAS_INSTALLATION_ID: build.id, CANVAS_BUNDLED_TOOLS: join(installed, 'tools'), CANVAS_CONNECTORS_HOME: join(profile, '.infinite-canvas/connectors'), PSModulePath: join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/Modules') };
// Simulate a machine with neither Node nor a CLI on PATH.
env.PATH = [join(installed, 'runtime'), join(process.env.SystemRoot, 'System32'), process.env.SystemRoot].join(delimiter);
for (const key of ['OPENAI_API_KEY', 'CODEX_API_KEY', 'CODEX_ACCESS_TOKEN', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GOOGLE_APPLICATION_CREDENTIALS']) delete env[key];
function run(file, args, cwd = scratch) {
    return new Promise((resolveRun, reject) => {
        const child = spawn(file, args, { cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
        let output = '';
        child.stdout.on('data', bytes => { output += bytes; });
        child.stderr.on('data', bytes => { output += bytes; });
        child.once('error', reject);
        child.once('exit', code => code === 0 ? resolveRun(output) : reject(new Error(`Process exited ${code}: ${output}`)));
    });
}
console.log('Installing into an isolated Unicode path, with no shortcuts or account changes…');
await run(join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'), ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(build.stage, 'install.ps1'), '-Quiet', '-NoLaunch', '-NoShortcuts', '-Destination', destination]);
const node = join(installed, 'runtime/node.exe');
assert.equal((await run(node, ['-p', 'require("node:os").homedir()'])).trim().toLowerCase(), profile.toLowerCase());
assert.match(await run(node, [join(installed, 'canvas-agent/node_modules/@openai/codex/bin/codex.js'), '--version']), /codex/i);
const { cliEntry } = await import(pathToFileURL(join(installed, 'canvas-connectors/src/cli-process.mjs')));
assert.ok(/\.js$/i.test(cliEntry(join(installed, 'tools/codex.cmd'))), 'Bundled Codex shim must resolve directly to JS so multiline arguments do not enter CMD');
assert.match(await run(join(installed, 'tools/agy.exe'), ['--version']), /1\.5\./);
console.log('Both bundled CLIs start without system Node or CLI installations.');
async function freePort() {
    const server = createServer();
    await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
    const port = server.address().port;
    await new Promise(resolveClose => server.close(resolveClose));
    return port;
}
const connectorPort = await freePort(), agentPort = await freePort();
env.CANVAS_CONNECTORS_PORT = String(connectorPort);
env.PORT = String(agentPort);
const origin = `http://127.0.0.1:${connectorPort}`;
const children = [];
async function start(name, entry, url) {
    const child = spawn(node, [entry], { cwd: join(installed, name), env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    children.push(child);
    let error = '', failed;
    child.stdout.resume();
    child.stderr.on('data', bytes => { error += bytes; });
    child.once('error', cause => { failed = cause; });
    child.once('exit', code => { failed = new Error(`${name} exited ${code}: ${error}`); });
    while (true) {
        if (failed) throw failed;
        try { const r = await fetch(url); if (r.ok) return await r.json(); } catch {}
        await delay(2500);
    }
}
try {
    const [connector, agent] = await Promise.all([
        start('canvas-connectors', 'src/index.mjs', `${origin}/api/connectors/health`),
        start('canvas-agent', 'dist/index.js', `http://127.0.0.1:${agentPort}/health`),
    ]);
    assert.equal(connector.installation, build.id);
    assert.equal(agent.installation, build.id);
    assert.equal((await fetch(`${origin}/config?setup=accounts`)).status, 200);
    const { providers } = await (await fetch(`${origin}/api/connectors/providers`)).json();
    for (const id of ['codex-cli', 'antigravity-cli']) {
        const provider = providers.find(p => p.id === id);
        assert.equal(provider.state, 'configured');
        assert.ok(provider.details.executable.toLowerCase().startsWith(join(installed, 'tools').toLowerCase()));
        assert.equal(provider.details.loginState, 'unchecked');
    }
    const bootstrap = await fetch(`${origin}/api/connectors/agent/bootstrap`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(bootstrap.status, 200);
    const connection = await bootstrap.json();
    assert.equal(connection.url, `http://127.0.0.1:${agentPort}`);
    assert.ok(connection.token);
    const result = { passed: true, installation: build.id, installed, profile, checks: ['installer', 'unicode-path', 'no-system-node', 'codex-binary', 'antigravity-binary', 'both-services', 'onboarding-page', 'automatic-cli-discovery', 'automatic-agent-connection'], realAccountGeneration: 'not-run' };
    await writeFile(join(root, 'artifacts/windows/smoke-result.json'), JSON.stringify(result, null, 2));
    console.log('PASS: clean-profile install, both services, CLI discovery and automatic Agent connection.');
} finally {
    await Promise.all(children.map(child => stopCli(child)));
}
