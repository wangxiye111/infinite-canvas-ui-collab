import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, writeFile, access, rename } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve, relative, delimiter, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { packageWindowsExe } from './package-exe.mjs';

if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('Build this package on Windows x64.');
const source = dirname(fileURLToPath(import.meta.url));
const root = resolve(source, '../..');
const output = join(root, 'artifacts/windows');
const reuse = process.argv[2] === '--reuse' ? resolve(process.argv[3] || '') : null;
if (reuse && (!reuse.startsWith(output + sep) || !/^build-\d+$/.test(relative(output, reuse)))) throw new Error('Reuse only a previous staging directory under artifacts/windows.');
const stage = reuse || join(output, `build-${Date.now()}`);
const payload = join(stage, 'payload');
const downloads = join(output, 'downloads');
await mkdir(payload, { recursive: true });
await mkdir(downloads, { recursive: true });
const digest = (data, algorithm = 'sha256') => createHash(algorithm).update(data).digest('hex');
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
async function fetchOk(url) { const response = await fetch(url); if (!response.ok) throw new Error(`Download failed (${response.status}): ${url}`); return response; }
async function download(url, file, hash, algorithm = 'sha256') {
    try { if (digest(await readFile(file), algorithm) === hash) return; } catch {}
    console.log(`Downloading ${new URL(url).pathname}`);
    const bytes = Buffer.from(await (await fetchOk(url)).arrayBuffer());
    if (digest(bytes, algorithm) !== hash) throw new Error(`Checksum mismatch: ${file}`);
    await writeFile(file, bytes);
}
function run(file, args, cwd = root, env = process.env) {
    return new Promise((resolveRun, reject) => {
        const child = spawn(file, args, { cwd, env, windowsHide: true, shell: false, stdio: 'inherit' });
        child.once('error', reject);
        child.once('exit', code => code === 0 ? resolveRun() : reject(new Error(`${file} exited ${code}`)));
    });
}
const psQuote = value => `'${value.replaceAll("'", "''")}'`;
const powershell = command => run('powershell.exe', ['-NoProfile', '-Command', `$ErrorActionPreference = 'Stop'; ${command}`], root, { ...process.env, PSModulePath: join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/Modules') });

console.log('Preparing official Node runtime…');
const nodeVersion = 'v24.22.3';
const nodeArchive = `node-${nodeVersion}-win-x64.zip`;
const checksums = await (await fetchOk(`https://nodejs.org/dist/${nodeVersion}/SHASUMS256.txt`)).text();
const nodeHash = checksums.split('\n').find(line => line.trim().endsWith(` ${nodeArchive}`))?.split(/\s+/)[0];
if (!nodeHash || !/^[0-9a-f]{64}$/.test(nodeHash)) throw new Error('Node release checksum missing.');
await download(`https://nodejs.org/dist/${nodeVersion}/${nodeArchive}`, join(downloads, nodeArchive), nodeHash);
if (!reuse) {
    await powershell(`Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::ExtractToDirectory(${psQuote(join(downloads, nodeArchive))}, ${psQuote(stage)})`);
    await cp(join(stage, `node-${nodeVersion}-win-x64`), join(payload, 'runtime'), { recursive: true });
}
const node = join(payload, 'runtime/node.exe');
const npm = join(payload, 'runtime/node_modules/npm/bin/npm-cli.js');
const env = { ...process.env, PATH: [join(payload, 'runtime'), process.env.PATH || ''].join(delimiter), npm_config_registry: 'https://registry.npmjs.org', npm_config_userconfig: join(stage, 'empty.npmrc') };
await writeFile(env.npm_config_userconfig, '');

for (const name of ['canvas-agent', 'canvas-connectors']) {
    const target = join(payload, name);
    await mkdir(target, { recursive: true });
    let installed = false;
    if (reuse) {
        try { installed = digest(await readFile(join(target, 'package-lock.json'))) === digest(await readFile(join(root, name, 'package-lock.json'))); await access(join(target, 'node_modules')); }
        catch { installed = false; }
    }
    for (const file of ['package.json', 'package-lock.json']) await cp(join(root, name, file), join(target, file));
    console.log(`Installing ${name} runtime dependencies…`);
    if (!installed) await run(node, [npm, 'ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], target, env);
}
await cp(join(root, 'canvas-connectors/src'), join(payload, 'canvas-connectors/src'), { recursive: true });
await cp(join(root, 'canvas-agent/agent-instructions.md'), join(payload, 'canvas-agent/agent-instructions.md'));
await cp(join(root, 'LICENSE'), join(payload, 'LICENSE'));
console.log('Building Agent and web into the package…');
await run(process.execPath, [join(root, 'canvas-agent/node_modules/typescript/bin/tsc'), '-p', join(root, 'canvas-agent/tsconfig.json'), '--outDir', join(payload, 'canvas-agent/dist')]);
await run(process.execPath, [join(root, 'web/node_modules/vite/bin/vite.js'), 'build', '--outDir', join(payload, 'web/dist')], join(root, 'web'), env);

const manifestUrl = 'https://antigravity-cli-auto-updater-974169037036.us-central1.run.app/manifests/windows_amd64.json';
const agy = await (await fetchOk(manifestUrl)).json();
if (new URL(agy.url).origin !== 'https://storage.googleapis.com' || !/^[0-9a-f]{128}$/i.test(agy.sha512)) throw new Error('Invalid official Antigravity release manifest.');
const agyCache = join(downloads, `agy-${agy.version}.exe`);
try {
    const existing = await readFile(join(homedir(), '.infinite-canvas/connectors/tools/antigravity/agy.exe'));
    if (digest(existing, 'sha512') === agy.sha512.toLowerCase()) await writeFile(agyCache, existing);
} catch {}
await download(agy.url, agyCache, agy.sha512.toLowerCase(), 'sha512');
await mkdir(join(payload, 'tools'), { recursive: true });
await cp(agyCache, join(payload, 'tools/agy.exe'));
await cp(join(source, 'codex.cmd'), join(payload, 'tools/codex.cmd'));
for (const file of ['launcher.mjs', 'launch.ps1', 'stop.ps1']) {
    const content = await readFile(join(source, file));
    await writeFile(join(payload, file), file.endsWith('.ps1') ? Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), content]) : content);
}
const version = (await readFile(join(root, 'VERSION'), 'utf8')).trim();
const provenance = { node: { version: nodeVersion, sha256: nodeHash }, antigravity: { version: agy.version, sha512: agy.sha512, manifestUrl }, codex: (await readJson(join(payload, 'canvas-agent/node_modules/@openai/codex/package.json'))).version };
await writeFile(join(payload, 'runtime-versions.json'), JSON.stringify(provenance, null, 2));
const files = [];
async function collect(directory) {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
        const file = join(directory, entry.name);
        if (file === join(payload, 'manifest.json')) continue;
        if (entry.isSymbolicLink()) throw new Error(`Unexpected symlink in package: ${file}`);
        if (entry.isDirectory()) await collect(file);
        else files.push({ path: relative(payload, file).replaceAll('\\', '/'), sha256: digest(await readFile(file)) });
    }
}
await collect(payload);
const id = `${version}-${digest(JSON.stringify(files)).slice(0, 12)}`;
await writeFile(join(payload, 'manifest.json'), JSON.stringify({ product: 'infinite-canvas', id, version, files }, null, 2));
await writeFile(join(stage, 'install.ps1'), Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), await readFile(join(source, 'install.ps1'))]));
await cp(join(source, 'install.cmd'), join(stage, 'install.cmd'));
await writeFile(join(stage, '使用说明.txt'), '\ufeff解压后双击 install.cmd，点击“安装并打开”。在画布中连接 ChatGPT 或 Google，完成登录即可使用。\r\n');
console.log('Compressing Windows package…');
const payloadZip = join(stage, `payload-${id}-${Date.now()}.zip`);
await powershell(`Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::CreateFromDirectory(${psQuote(payload)}, ${psQuote(payloadZip)})`);
await cp(payloadZip, join(stage, 'payload.zip'));
const zip = join(output, `InfiniteCanvas-Windows-x64-${id}.zip`);
const portable = join(stage, `portable-${id}-${Date.now()}`);
await mkdir(portable);
for (const file of ['payload.zip', 'install.ps1', 'install.cmd', '使用说明.txt']) await cp(join(stage, file), join(portable, file));
const zipTemporary = join(output, `package-${Date.now()}.zip`);
await powershell(`Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::CreateFromDirectory(${psQuote(portable)}, ${psQuote(zipTemporary)})`);
await rename(zipTemporary, zip);
const exe = join(output, `InfiniteCanvas-Setup-x64-${id}.exe`);
await packageWindowsExe(stage, exe);
await access(exe);
await writeFile(join(output, 'latest-build.json'), JSON.stringify({ id, stage, payload, zip, exe }, null, 2));
console.log(`Ready: ${exe}\nBackup package: ${zip}`);
