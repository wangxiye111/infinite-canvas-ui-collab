import { randomUUID } from 'node:crypto';

const supported = new Set(['codex-cli', 'antigravity-cli']);
const authenticated = (engine, result) => result.details?.loginState === 'authenticated' && (engine !== 'codex-cli' || result.details.authMethod === 'chatgpt');

export function createOnboarding({ providerById, getConfig, summarize }) {
  const tasks = new Map(), pending = new Map();
  const snapshot = task => structuredClone(task);
  const get = id => {
    const task = tasks.get(id);
    if (!task) throw new Error('连接记录不存在，请重新连接账号。');
    return task;
  };
  return {
    list: () => [...tasks.values()].map(snapshot),
    get: id => snapshot(get(id)),
    start(engine) {
      if (!supported.has(engine)) throw new Error('此入口仅支持 ChatGPT 和 Google 账号。');
      const existing = [...tasks.values()].find(task => task.engine === engine && task.status === 'running');
      if (existing) return snapshot(existing);
      const provider = providerById(engine);
      const task = { id: randomUUID(), engine, status: 'running', step: 'checking', message: '正在检查本机连接…' };
      const controller = new AbortController();
      tasks.set(task.id, task);
      const completion = Promise.resolve().then(async () => {
        const config = getConfig(engine);
        let checked = await provider.check(config, undefined, controller.signal);
        controller.signal.throwIfAborted();
        if (checked.state === 'not-installed') throw new Error('尚未找到连接工具，请运行 Windows 安装包后重新打开画布。');
        if (!authenticated(engine, checked)) {
          task.step = 'login';
          task.message = engine === 'codex-cli' ? '请在打开的官方页面登录 ChatGPT。' : '请在打开的官方页面登录 Google。';
          await provider.login(config, value => {
            if (task.status !== 'running') return;
            if (value?.url) task.url = value.url;
          }, { signal: controller.signal });
          controller.signal.throwIfAborted();
          task.step = 'verifying';
          task.message = '正在完成账号连接…';
          delete task.url;
          checked = await provider.check(config, undefined, controller.signal);
          controller.signal.throwIfAborted();
          if (!authenticated(engine, checked)) throw new Error('登录尚未完成，请重新连接并在官方页面完成授权。');
        }
        const result = await summarize(provider, checked);
        controller.signal.throwIfAborted();
        task.provider = result;
        task.status = 'succeeded';
        task.step = 'complete';
        task.message = checked.details?.imageAvailable ? '账号已连接，可以开始对话和生图。' : '账号已连接，可以开始对话；图片功能暂不可用。';
      }).catch(error => {
        if (task.status === 'cancelled') return;
        task.status = 'failed';
        task.message = error.message || '连接失败，请重新连接。';
        delete task.url;
      }).finally(() => pending.delete(task.id));
      pending.set(task.id, { controller, completion });
      return snapshot(task);
    },
    cancel(id) {
      const task = get(id);
      if (task.status === 'running') {
        task.status = 'cancelled';
        task.message = '已取消连接，可随时重新连接。';
        delete task.url;
        pending.get(id)?.controller.abort(new Error('用户取消连接'));
      }
      return snapshot(task);
    },
    async close() {
      const running = [...pending.values()];
      for (const id of pending.keys()) this.cancel(id);
      await Promise.all(running.map(item => item.completion));
    },
  };
}
