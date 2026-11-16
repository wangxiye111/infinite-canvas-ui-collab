import { createInterface } from "node:readline";
import { spawnCli, stopCli } from "../cli-process.mjs";
import { classifyCodexFailure } from "./codex-diagnostics.mjs";

const failure = "无法读取官方 Codex 模型目录；未发起生成请求。";
const nonempty = (value) => typeof value === "string" && value.trim().length > 0;
const advice = {
  network: '网络连接失败，请检查网络或代理后重新检测。', authentication: '官方登录已失效，请在官方客户端检查登录。',
  tls: '安全连接证书校验失败，请检查网络证书。', permission: '官方服务拒绝访问，请检查账号权限与网络。',
  'rate-limit': '官方请求频率受限，请稍后手动检测。', quota: '官方账号用量受限，请检查账号用量。',
  configuration: '本机 Codex 配置无效，请检查官方客户端配置。', 'cli-version': '当前 CLI 参数不兼容，请检查 Codex 版本。',
  'model-unavailable': '官方模型目录未提供所需模型，请检查账号权限。',
  protocol: '模型目录响应格式异常，请检查 Codex 与连接服务版本。', rpc: '官方目录请求返回错误，请在官方客户端检查连接。',
  process: '模型检测进程提前退出或无法启动，请检查 Codex 安装。', cancelled: '本次模型检测已取消，可重新检测。',
  cleanup: '模型目录已读取；检测进程收尾异常，请查看本机 Codex 进程。',
};
export const catalogFailure = code => Object.assign(new Error(`${failure}${advice[code] || advice.process}（诊断 ${Object.hasOwn(advice, code) ? code : 'process'}）`), { code: Object.hasOwn(advice, code) ? code : 'process' });

// Read authenticated official metadata only. The caller supplies its isolated config/environment.
export function queryCodexImageModels({ spawn = spawnCli, stop = stopCli, executable, cwd, env, configArgs = [], signal, onCleanupError }) {
  return new Promise((resolve, reject) => {
    let child, lines, done = false, id = 0, awaiting = 0;
    const models = [], cursors = new Set();
    let diagnostic = 'process';
    const classify = text => { const code = classifyCodexFailure('', text).code; if (code !== 'unknown') diagnostic = code; };
    const finish = async (error) => {
      if (done) return;
      done = true;
      signal?.removeEventListener("abort", abort);
      lines?.close();
      try { child?.stdin?.end(); } catch {}
      try { await stop(child); } catch {
        // A complete directory remains valid even if process-tree cleanup races its normal exit.
        if (child && child.exitCode == null && child.signalCode == null) {
          await new Promise(resolve => { child.once('close', resolve); if (!child.kill('SIGTERM')) resolve(); });
        }
        onCleanupError?.({ code: 'cleanup', message: advice.cleanup });
      }
      if (error) reject(catalogFailure(error === true ? diagnostic : error));
      else resolve(models);
    };
    const abort = () => finish(signal?.aborted ? 'cancelled' : diagnostic);
    const send = (method, params, request = true) => {
      if (done) return;
      if (request) awaiting = ++id;
      child.stdin.write(`${JSON.stringify({ ...(request ? { id: awaiting } : {}), method, params })}\n`);
    };
    if (signal?.aborted) return finish(true);
    try {
      child = spawn(executable, ["app-server", "--listen", "stdio://", ...configArgs], { cwd, env, shell: false, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
      child.on("error", abort);
      child.once("close", abort);
      child.stdin.on("error", abort);
      child.stdout.on("error", abort);
      child.stderr.on("error", abort);
      child.stderr.on('data', chunk => classify(String(chunk)));
      lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
      lines.on("error", abort);
      lines.on("close", () => { if (!done) finish(true); });
      lines.on("line", (line) => {
        if (done) return;
        try {
          const message = JSON.parse(line);
          if (!message || typeof message !== "object" || Array.isArray(message)) throw new Error();
          if (!Object.hasOwn(message, "id") && typeof message.method === "string") return;
          if (Object.hasOwn(message, 'error')) {
            classify(String(message.error?.message || ''));
            return finish(diagnostic === 'process' ? 'rpc' : diagnostic);
          }
          if (message.id !== awaiting || !message.result || typeof message.result !== "object" || Array.isArray(message.result)) throw new Error();
          if (awaiting === 1) {
            send("initialized", {}, false);
            send("model/list", { includeHidden: true, cursor: null });
            return;
          }
          const { data, nextCursor } = message.result;
          if (!Array.isArray(data) || (nextCursor !== null && !nonempty(nextCursor))) throw new Error();
          for (const model of data) {
            if (!model || !nonempty(model.id) || !nonempty(model.model) || typeof model.isDefault !== "boolean" || !nonempty(model.defaultReasoningEffort) || !Array.isArray(model.supportedReasoningEfforts) || model.supportedReasoningEfforts.some((effort) => !nonempty(effort?.reasoningEffort))) throw new Error();
            // The caller needs the CLI slug, not the directory record identifier.
            models.push({ id: model.model, isDefault: model.isDefault, defaultReasoningEffort: model.defaultReasoningEffort, supportedReasoningEfforts: model.supportedReasoningEfforts.map((effort) => effort.reasoningEffort) });
          }
          if (nextCursor === null) return finish(false);
          if (cursors.has(nextCursor)) throw new Error();
          cursors.add(nextCursor);
          send("model/list", { includeHidden: true, cursor: nextCursor });
        } catch { finish('protocol'); }
      });
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) return finish(true);
      send("initialize", { clientInfo: { name: "canvas_image_model_check", version: "0.1.0" } });
    } catch { finish(true); }
  });
}
