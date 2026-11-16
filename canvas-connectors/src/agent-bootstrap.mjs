import { readFile } from 'node:fs/promises';

// Called only by an explicit same-origin POST. Never return unrelated agent settings.
export async function readLocalAgentConnection(configFile, fetcher = globalThis.fetch) {
  let config;
  try { config = JSON.parse(await readFile(configFile, 'utf8')); }
  catch { throw new Error('尚未启动本机 Canvas Agent。请先运行 npm start --prefix canvas-agent，再连接。'); }
  let address;
  try { address = new URL(config.url); } catch { throw new Error('本机 Agent 地址配置无效，请使用手动连接。'); }
  if (address.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(address.hostname) || address.username || address.password || address.search || address.hash || address.pathname !== '/' || typeof config.token !== 'string' || !config.token.trim()) {
    throw new Error('自动连接仅支持本机 Agent，请使用手动连接核对地址与 Token。');
  }
  try {
    const response = await fetcher(new URL('/health', address), {redirect:'error'});
    const health = await response.json();
    if (!response.ok || health.ok !== true) throw new Error();
  } catch { throw new Error('本机 Canvas Agent 未运行或健康检查失败，请启动后重试。'); }
  return {url:address.origin,token:config.token};
}
