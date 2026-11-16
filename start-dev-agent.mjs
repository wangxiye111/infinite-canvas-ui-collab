import { spawn as spawnProcess } from 'node:child_process';
import { readFile, mkdir, appendFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { stopCli } from './canvas-connectors/src/cli-process.mjs';

export async function ensureDevelopmentAgent({ root, configFile = join(homedir(), '.infinite-canvas/canvas-agent.json'), env = process.env, fetcher = fetch, spawn = spawnProcess }) {
    let config = {};
    try { config = JSON.parse(await readFile(configFile, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const address = new URL(config.url || 'http://127.0.0.1:17371');
    if (address.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(address.hostname) || address.username || address.password || address.search || address.hash || address.pathname !== '/') throw new Error('本机 Agent 地址配置无效，请检查本机配置。');
    if (env.PORT) address.port = String(Number(env.PORT));
    const health = async () => {
        const response = await fetcher(new URL('/health', address), { redirect: 'error' });
        const result = await response.json();
        if (!response.ok || result.ok !== true || !Number.isInteger(result.protocolVersion)) throw new Error('本机 Agent 健康检查失败；保留现有服务，请检查端口。');
    };
    try {
        await health();
        return { reused: true, close: async () => {} };
    } catch (error) {
        if (error.cause?.code !== 'ECONNREFUSED' && error.code !== 'ECONNREFUSED') throw error;
    }
    const logs = join(root, 'logs');
    await mkdir(logs, { recursive: true });
    const child = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
        cwd: join(root, 'canvas-agent'), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...env, PORT: address.port || '80', CANVAS_AGENT_HIDE_TOKEN: '1' },
    });
    let writes = Promise.resolve();
    const log = line => {
        const safe = /connect token/i.test(line) ? 'Connect token: [hidden]' : config.token ? line.replaceAll(config.token, '[hidden]') : line;
        writes = writes.then(() => appendFile(join(logs, 'dev-agent.log'), safe + '\n')).catch(() => {});
    };
    const output = createInterface({ input: child.stdout });
    const errors = createInterface({ input: child.stderr });
    output.on('line', log);
    errors.on('line', log);
    try {
        await new Promise((resolve, reject) => {
            const failed = () => reject(new Error('本机 Agent 启动失败，请查看 logs/dev-agent.log。'));
            child.once('error', failed);
            child.once('exit', failed);
            output.on('line', line => { if (line === 'Infinite Canvas Agent') resolve(); });
        });
        await health();
        return { reused: false, close: async () => { await stopCli(child); await writes; } };
    } catch (error) {
        await stopCli(child);
        await writes;
        throw error;
    }
}
