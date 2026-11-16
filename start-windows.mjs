import { spawn } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync } from 'node:fs';
import { connect } from 'node:net';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Node.js 22 or newer is required.');
for (const file of ['web/dist/index.html', 'canvas-agent/dist/index.js', 'canvas-agent/node_modules/@openai/codex/package.json', 'canvas-connectors/node_modules/read-cmd-shim/package.json']) {
  if (!existsSync(join(root, file))) throw new Error(`Missing ${file}. See canvas-connectors/README.md for setup.`);
}
const logs = join(homedir(), '.infinite-canvas', 'logs');
mkdirSync(logs, { recursive: true });
const connectorPort = Number(process.env.CANVAS_CONNECTORS_PORT || 3000);
for (const [name, entry, port] of [['canvas-agent', 'dist/index.js', 17371], ['canvas-connectors', 'src/index.mjs', connectorPort]]) {
  const occupied = await new Promise((resolve, reject) => {
    const socket = connect({ host: '127.0.0.1', port });
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', (error) => error.code === 'ECONNREFUSED' ? resolve(false) : reject(error));
  });
  if (occupied) { console.log(`${name}: port ${port} already in use; left unchanged.`); continue; }
  const stdout = openSync(join(logs, `${name}.out.log`), 'a');
  const stderr = openSync(join(logs, `${name}.err.log`), 'a');
  try {
    const child = spawn(process.execPath, [entry], { cwd: join(root, name), detached: true, windowsHide: true, stdio: ['ignore', stdout, stderr], env: { ...process.env, PORT: '17371', CANVAS_AGENT_HIDE_TOKEN: '1' } });
    await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
    child.unref();
    console.log(`${name}: launched PID ${child.pid}.`);
  } finally { closeSync(stdout); closeSync(stderr); }
}
console.log(`Open http://127.0.0.1:${connectorPort}/ . Startup logs: ${logs}`);
