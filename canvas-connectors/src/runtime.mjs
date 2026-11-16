import { join, delimiter, isAbsolute } from "node:path";
import { homedir } from "node:os";
import { findExecutable, spawnCli, stopCli } from "./cli-process.mjs";

const binaries = new Set(["kling", "dreamina", "dreamina-canvas", "tripo"]);
export function createRuntime(dataDir) {
  const which = async (name, executable) => {
    if (!binaries.has(name)) return null;
    if (executable && !isAbsolute(executable)) throw new Error("连接工具请填写可执行文件的绝对路径，不填写命令参数");
    const dirs = [
      join(dataDir, "tools", "node_modules", ".bin"),
      join(homedir(), ".local", "bin"),
      join(homedir(), ".dreamina", "bin"),
      ...(process.env.PATH || "").split(delimiter),
    ];
    return findExecutable(executable || name, dirs);
  };
  const children = new Set();
  const runCli = async (name, args, { onMessage, executable } = {}) => {
    const path = await which(name, executable);
    if (!path) throw new Error(`未安装官方 ${name} 客户端`);
    if (
      !Array.isArray(args) ||
      args.some((arg) => typeof arg !== "string" || arg.includes("\0"))
    )
      throw new Error("无效的客户端参数");
    return new Promise((resolve, reject) => {
      const child = spawnCli(path, args, {
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
        env: process.env,
      });
      children.add(child);
      let stdout = "",
        stderr = "";
      child.stdout.on("data", (chunk) => {
        const text = chunk.toString();
        stdout += text;
        onMessage?.(text);
      });
      child.stderr.on("data", (chunk) => {
        const text = chunk.toString();
        stderr += text;
        onMessage?.(text);
      });
      child.on("error", (error) => {
        children.delete(child);
        reject(error);
      });
      child.on("close", (code, signal) => {
        children.delete(child);
        resolve({ stdout, stderr, code: code ?? (signal ? 137 : 1) });
      });
    });
  };
  return {
    which,
    runCli,
    async close() {
      await Promise.all([...children].map((child) => stopCli(child)));
    },
  };
}
