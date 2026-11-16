import { spawn } from 'node:child_process';
import { readFile, writeFile, access } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export async function packageWindowsExe(stage, exe) {
    const compiler = join(process.env.SystemRoot, 'Microsoft.NET/Framework64/v4.0.30319/csc.exe');
    await access(compiler);
    await new Promise((resolveCompile, reject) => {
        const child = spawn(compiler, ['/nologo', '/target:winexe', '/platform:x64', '/optimize+', '/reference:System.Windows.Forms.dll', `/win32manifest:${join(here, 'setup.manifest')}`, `/out:${exe}`, `/resource:${join(stage, 'payload.zip')},payload.zip`, `/resource:${join(stage, 'install.ps1')},install.ps1`, join(here, 'Setup.cs')], { windowsHide: true, stdio: 'inherit' });
        child.once('error', reject);
        child.once('exit', code => code === 0 ? resolveCompile() : reject(new Error(`Windows installer compiler exited ${code}`)));
    });
    await access(exe);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const stage = resolve(process.argv[2]);
    const output = dirname(stage);
    const payload = join(stage, 'payload');
    const { id } = JSON.parse(await readFile(join(payload, 'manifest.json'), 'utf8'));
    const exe = join(output, `InfiniteCanvas-Setup-x64-${id}.exe`);
    const zip = join(output, `InfiniteCanvas-Windows-x64-${id}.zip`);
    await packageWindowsExe(stage, exe);
    await access(zip);
    await writeFile(join(output, 'latest-build.json'), JSON.stringify({ id, stage, payload, zip, exe }, null, 2));
    console.log(`Ready: ${exe}`);
}
