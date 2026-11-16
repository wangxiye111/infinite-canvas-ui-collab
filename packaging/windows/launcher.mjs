import { spawn } from 'node:child_process';
import { closeSync, openSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const root = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
const logs = join(homedir(), '.infinite-canvas', 'logs');
await mkdir(logs, { recursive: true });
const env = { ...process.env, CANVAS_INSTALLATION_ID: manifest.id, CANVAS_BUNDLED_TOOLS: join(root, 'tools'), CANVAS_AGENT_HIDE_TOKEN: '1',
    PATH: [join(root, 'runtime'), join(root, 'tools'), process.env.PATH || ''].join(delimiter), PORT: '17371', CANVAS_CONNECTORS_PORT: '3000' };

async function health(url) {
    try { const r = await fetch(url); if (!r.ok) return { occupied: true }; return await r.json(); }
    catch (error) { if (error.cause?.code === 'ECONNREFUSED') return null; throw new Error(`无法连接本地服务：${url}`); }
}
async function start(name, entry, url, valid) {
    const running = await health(url);
    if (running) {
        if (!valid(running)) throw new Error('已有其他版本的画布或其他程序占用本地端口。请退出正在运行的旧画布后，再从桌面打开新版。');
        return;
    }
    const output = openSync(join(logs, `${name}.out.log`), 'a');
    const errors = openSync(join(logs, `${name}.err.log`), 'a');
    let child;
    try { child = spawn(process.execPath, [entry], { cwd: join(root, name), env, detached: true, windowsHide: true, stdio: ['ignore', output, errors] }); }
    finally { closeSync(output); closeSync(errors); }
    let failed;
    child.once('error', error => { failed = error; });
    child.once('exit', () => { failed = new Error(`${name} 启动失败。可查看 ${logs} 中的日志后重试。`); });
    while (true) {
        if (failed) throw failed;
        const result = await health(url);
        if (result) {
            if (!valid(result)) throw new Error('本地服务与安装版本不一致，请退出旧画布后重试。');
            child.unref();
            return;
        }
        await delay(2500);
    }
}
// Check the canvas first so an old installation never gets silently reused.
await start('canvas-connectors', 'src/index.mjs', 'http://127.0.0.1:3000/api/connectors/health', value => value.product === 'infinite-canvas' && value.installation === manifest.id);
await start('canvas-agent', 'dist/index.js', 'http://127.0.0.1:17371/health', value => value.ok === true && value.installation === manifest.id);
const browser = spawn('explorer.exe', [process.argv.includes('--setup') ? 'http://127.0.0.1:3000/config?setup=accounts' : 'http://127.0.0.1:3000/canvas'], { windowsHide: true, stdio: 'ignore', detached: true });
browser.unref();
