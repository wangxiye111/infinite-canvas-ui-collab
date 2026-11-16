// Persist fixed diagnostic categories only, never raw CLI stderr, account metadata or tokens.
export function classifyCodexFailure(stdout = "", stderr = "", exitCode) {
  const errors = [];
  for (const line of stdout.split(/\r?\n/)) {
    let event;
    try { event = JSON.parse(line); } catch { continue; }
    if (event?.type !== "error" && event?.type !== "turn.failed") continue;
    const message = event.error?.message || event.message;
    if (typeof message === "string") errors.push(message);
  }
  const text = errors.length ? errors.join("\n") : stderr;
  const rules = [
    ["model-unavailable", /model[^\n]*(?:not supported|does not exist|not found|unavailable)|unsupported model|model_not_found/i, "本次图片驱动模型不可用；请重新检测官方模型目录并核对图片模型选择。"],
    ["quota", /insufficient_quota|usage.?limit|quota|usage.*exceeded/i, "官方返回额度或用量限制；请在官方账号确认可用额度与恢复时间。"],
    ["rate-limit", /429|rate.?limit|too many requests/i, "官方返回请求频率限制；没有自动补发生成任务。"],
    ["authentication", /401|unauthorized|invalid.?grant|token[^\n]*(?:expired|invalid)|authentication[^\n]*fail/i, "官方登录认证失败或已失效；请在官方客户端核对登录，不会替你退出或重登。"],
    ["tls", /certificate|\bTLS\b|\bSSL\b|CERT_/i, "安全连接证书校验失败；请检查本机网络或官方客户端，不会绕过证书校验。"],
    ["permission", /403|forbidden|permission denied|approval[^\n]*(?:required|denied)|operation not permitted/i, "官方服务或本机权限检查拒绝了请求；不会跳过授权或沙箱。"],
    ["cli-version", /unexpected argument|unrecognized[^\n]*(?:option|argument)/i, "当前 Codex CLI 不支持所需调用参数；请核对官方客户端版本。"],
    ["configuration", /error loading config|invalid configuration|unknown config|reasoning[^\n]*(?:unsupported|not supported|invalid)/i, "Codex 配置或模型参数无效；请在官方客户端核对，不会覆盖已有配置。"],
    ["network", /stream disconnected|ECONN|ENOTFOUND|connection[^\n]*(?:failed|closed|reset|refused)|network|timed? ?out|timeout/i, "与官方服务的连接中断或不可达；请核对原任务，没有重新提交。"],
  ];
  const match = rules.find(([, pattern]) => pattern.test(text));
  const code = match?.[0] || "unknown";
  const exit = Number.isInteger(exitCode) ? String(exitCode) : "进程终止";
  return { code, message: `${match?.[2] || "CLI 未返回可识别的错误类别，请在官方客户端核对原任务。"}（诊断 ${code}，退出码 ${exit}）不会自动改模型或重新生成。` };
}
