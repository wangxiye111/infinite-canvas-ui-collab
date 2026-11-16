import { spawn } from "node:child_process";
import { realpathSync } from "node:fs";
import { delimiter, dirname, isAbsolute, join, resolve } from "node:path";
import crossSpawn from "cross-spawn";
import readCmdShim from "read-cmd-shim";
import which from "which";

export function cliEntry(command) {
  if (process.platform === "win32" && /\.cmd$/i.test(command)) {
    try { return resolve(dirname(command), readCmdShim.sync(realpathSync(command).replace(/\.cmd$/i, ".cmd"))); }
    catch (error) { if (error.code !== "ENOTASHIM") throw error; }
  }
  return command;
}

export function spawnCli(command, args, options) {
  if (process.platform === "win32" && /\.(cmd|bat)$/i.test(command)) {
    const target = cliEntry(command);
    // npm's JS entry can receive multiline prompts directly; cmd.exe truncates them.
    if (target !== command && /\.[cm]?js$/i.test(target)) return crossSpawn(process.execPath, [target, ...args], options);
    if (args.some((arg) => /[\r\n]/.test(arg))) throw new Error("此 Windows CMD 客户端不支持多行参数，请使用官方 npm 安装版本或 EXE 入口");
  }
  return crossSpawn(command, args, options);
}

export async function findExecutable(name, directories, env = process.env) {
  const candidates = isAbsolute(name) ? [name] : /[/\\]/.test(name) ? [] : directories.filter(Boolean).map((directory) => join(directory, name));
  for (const candidate of candidates) {
    const executable = await which(candidate, { path: directories.join(delimiter), pathExt: env.PATHEXT, nothrow: true });
    if (executable) return executable;
  }
  return null;
}

// Only terminate the child launched by this service, including Windows npm shim descendants.
export async function stopCli(child, processGroup = false) {
  if (!child || child.exitCode != null || child.signalCode != null) return;
  const closed = new Promise((resolve) => child.once("close", resolve));
  if (process.platform === "win32" && child.pid) {
    await new Promise((resolve, reject) => {
      const killer = spawn(join(process.env.SystemRoot || "C:\\Windows", "System32", "taskkill.exe"), ["/PID", String(child.pid), "/T", "/F"], { shell: false, windowsHide: true, stdio: "ignore" });
      killer.once("error", reject);
      killer.once("close", (code) => code === 0 || child.exitCode != null || child.signalCode != null ? resolve() : reject(new Error("无法终止本次 CLI 进程树")));
    });
  } else if (processGroup && child.pid) process.kill(-child.pid, "SIGTERM");
  else child.kill("SIGTERM");
  await closed;
}
