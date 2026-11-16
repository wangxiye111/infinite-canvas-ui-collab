import http from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { readLocalAgentConnection } from "./agent-bootstrap.mjs";
import { createStore, mimeForName } from "./store.mjs";
import { createJobs } from "./jobs.mjs";
import { createRuntime } from "./runtime.mjs";
import { createOnboarding } from "./onboarding.mjs";
import { createWorkspaceStorage } from "./workspace-storage.mjs";

const apiPrefix = "/api/connectors";
const error = (message, status = 400) =>
  Object.assign(new Error(message), { status });
const json = (res, value, status = 200) => {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(value));
};
async function body(req) {
  if (!String(req.headers["content-type"] || "").startsWith("application/json"))
    throw error("需要JSON请求");
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  try {
    return JSON.parse(Buffer.concat(chunks).toString() || "{}");
  } catch {
    throw error("请求JSON格式不正确");
  }
}
function localRequest(req) {
  const host = String(req.headers.host || "");
  let url;
  try {
    url = new URL(`http://${host}`);
  } catch {
    return false;
  }
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) return false;
  const origin = req.headers.origin;
  if (origin) {
    try {
      const parsed = new URL(origin);
      if (parsed.origin !== `http://${host}`) return false;
    } catch {
      return false;
    }
  } else if (!["GET", "HEAD"].includes(req.method)) return false;
  if (req.headers["sec-fetch-site"] === "cross-site") {
    // Opening the UI is safe; cross-site API reads and mutations remain forbidden.
    let path;
    try { path = decodeURIComponent(new URL(req.url, url).pathname); } catch { return false; }
    if (req.method !== "GET" || req.headers["sec-fetch-mode"] !== "navigate" || req.headers["sec-fetch-dest"] !== "document" || path.startsWith(apiPrefix + "/")) return false;
  }
  return true;
}

export async function createConnectorServer({
  dataDir,
  distDir,
  providersFactory,
  fetch: fetcher = globalThis.fetch,
  runCli,
  which,
  agentConfigFile = resolve(homedir(), ".infinite-canvas/canvas-agent.json"),
} = {}) {
  if (!dataDir) throw new Error("需要连接服务数据目录");
  const workspace = createWorkspaceStorage(dataDir);
  const store = createStore(dataDir),
    runtime = createRuntime(dataDir),
    logins = new Map(),
    checks = new Map();
  const ctx = {
    dataDir,
    fetch: fetcher,
    runCli: runCli || runtime.runCli,
    which: which || runtime.which,
    getFile: (id) => store.getFile(id),
    async saveRemote(url, options = {}) {
      const address = new URL(url);
      if (address.protocol !== "https:") throw error("只允许HTTPS平台资源");
      const response = await fetcher(url, {
        headers: options.headers,
        redirect: "error",
      });
      if (!response.ok || !response.body) throw error("平台资源下载失败");
      const file = await store.saveFile(response.body, {
        name: options.name || "result",
        mimeType:
          response.headers.get("content-type") || "application/octet-stream",
      });
      return {
        id: file.id,
        url: `${apiPrefix}/files/${file.id}`,
        name: file.name,
        mimeType: file.mimeType,
        kind: options.kind || "image",
      };
    },
  };
  if (!providersFactory) {
    const module = await import("./providers/index.mjs");
    providersFactory = module.createProviders || module.default;
  }
  const providers = await providersFactory(ctx),
    jobs = createJobs(store, providers, { fetch: fetcher });
  const providerById = (id) => {
    const provider = providers.find((item) => item.id === id);
    if (!provider) throw error("平台不存在", 404);
    return provider;
  };
  const summary = async (provider, verified) => {
    const config = store.configs[provider.id] || {};
    let state;
    try {
      state = verified || (await provider.status(config));
    } catch (err) {
      state = { state: "error", message: err.message };
    }
    return {
      ...store.public({
        id: provider.id,
        name: provider.name,
        auth: provider.auth,
        billing: provider.billing,
        docs: provider.docs,
        actions: provider.actions,
        ...state,
      }),
      // Redact values without treating schema flags or empty inputs as credentials.
      fields: provider.fields.map(field => ({ ...store.public(field), secret: field.secret })),
      config: Object.fromEntries(
        provider.fields.map((field) => [
          field.key,
          field.secret ? "" : store.public(config[field.key] || ""),
        ]),
      ),
      configuredFields: provider.fields
        .filter((field) => Boolean(config[field.key]))
        .map((field) => field.key),
    };
  };
  const onboarding = createOnboarding({ providerById, getConfig: id => store.configs[id] || {}, summarize: async (p, checked) => {
    checks.set(p.id, store.public(checked));
    return summary(p, checked);
  } });
  const server = http.createServer(async (req, res) => {
    try {
      if (!localRequest(req)) throw error("只接受当前本地画布的同源请求", 403);
      const url = new URL(req.url, `http://${req.headers.host}`);
      const path = decodeURIComponent(url.pathname);
      if (path.startsWith(apiPrefix + "/")) {
        const parts = path.slice(apiPrefix.length + 1).split("/");
        if (parts[0] === "workspace") {
          if (req.method === "GET" && parts.length === 2) return json(res, { entries: workspace.list(parts[1]) });
          if (req.method === "GET" && parts.length === 3) return json(res, { record: workspace.get(parts[1], parts[2]) });
          if (req.method === "PUT" && parts.length === 3) return json(res, workspace.put(parts[1], parts[2], await body(req)));
        }
        if (req.method === "GET" && parts[0] === "health")
          return json(res, { ok: true, version: "0.1.0", product: "infinite-canvas", onboarding: true, installation: process.env.CANVAS_INSTALLATION_ID || null });
        if (parts[0] === "onboarding") {
          if (req.method === "GET" && parts.length === 1) return json(res, store.public({ tasks: onboarding.list() }));
          if (req.method === "GET" && parts.length === 2) return json(res, store.public(onboarding.get(parts[1])));
          if (req.method === "POST") {
            await body(req);
            if (parts.length === 2) return json(res, store.public(onboarding.start(parts[1])), 202);
            if (parts.length === 3 && parts[2] === "cancel") return json(res, store.public(onboarding.cancel(parts[1])));
          }
        }
        if (req.method === "POST" && parts.join("/") === "agent/bootstrap") {
          await body(req);
          return json(res, await readLocalAgentConnection(agentConfigFile, fetcher));
        }
        if (parts[0] === "providers") {
          if (req.method === "GET" && parts.length === 1)
            return json(res, {
              providers: await Promise.all(
                providers.map((p) => summary(p, checks.get(p.id))),
              ),
            });
          const p = providerById(parts[1]);
          if (req.method === "POST" && parts.length === 3 && parts[2] === "detect") {
            await body(req);
            checks.delete(p.id);
            return json(res, await summary(p));
          }
          if (req.method === "PUT" && parts.length === 2) {
            const input = await body(req);
            if (
              !input.config ||
              typeof input.config !== "object" ||
              Array.isArray(input.config)
            )
              throw error("平台配置无效");
            const config = { ...store.configs[p.id] };
            for (const field of p.fields) {
              if (!Object.hasOwn(input.config, field.key)) continue;
              const value = input.config[field.key];
              if (typeof value !== "string") throw error("配置值必须是文本");
              if (field.secret && !value.trim()) continue;
              config[field.key] = value.trim();
            }
            store.configs[p.id] = config;
            store.saveConfigs();
            checks.delete(p.id);
            return json(res, await summary(p));
          }
          if (req.method === "POST" && parts[2] === "check") {
            await body(req);
            let result;
            try {
              result = await p.check(store.configs[p.id] || {});
            } catch (err) {
              result = { state: "error", message: err.message };
            }
            checks.set(p.id, store.public(result));
            return json(res, await summary(p, result));
          }
          if (req.method === "POST" && parts[2] === "login") {
            await body(req);
            if (!p.login) throw error("该平台使用API配置，不提供CLI登录");
            const existing = [...logins.values()].find(
              (login) => login.provider === p.id && login.status === "running",
            );
            if (existing)
              return json(res, { ...existing, loginId: existing.id });
            const login = {
              id: randomUUID(),
              provider: p.id,
              status: "running",
              message: "正在启动官方授权，请在浏览器完成登录",
            };
            logins.set(login.id, login);
            Promise.resolve()
              .then(() =>
                p.login(store.configs[p.id] || {}, (message) => {
                  if (message && typeof message === "object")
                    for (const key of ["message", "url", "code"])
                      if (typeof message[key] === "string")
                        login[key] = store.public(message[key]);
                }),
              )
              .then(() => {
                login.status = "succeeded";
                login.message =
                  "官方客户端登录已完成，请点击检查连接核实账号能力";
                checks.delete(p.id);
              })
              .catch((err) => {
                login.status = "failed";
                login.message = store.public(err.message);
              });
            return json(res, { ...login, loginId: login.id });
          }
        }
        if (req.method === "GET" && parts[0] === "logins" && parts[1]) {
          const login = logins.get(parts[1]);
          if (!login) throw error("授权记录不存在", 404);
          return json(res, store.public(login));
        }
        if (parts[0] === "files") {
          if (req.method === "POST" && parts.length === 1) {
            const file = await store.saveFile(req, {
              name: url.searchParams.get("name") || "input",
              mimeType:
                req.headers["content-type"] || "application/octet-stream",
            });
            return json(res, file, 201);
          }
          if (req.method === "GET" && parts.length === 2) {
            const file = store.getFile(parts[1]);
            res.writeHead(200, {
              "Content-Type": file.mimeType,
              "Content-Length": file.bytes,
              "Cache-Control": "private, no-store",
              "X-Content-Type-Options": "nosniff",
              "Content-Security-Policy": "sandbox; default-src 'none'",
              "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
            });
            createReadStream(file.path)
              .on("error", () => res.destroy())
              .pipe(res);
            return;
          }
        }
        if (parts[0] === "jobs") {
          if (req.method === "GET" && parts.length === 1)
            return json(res, store.public({ jobs: jobs.list() }));
          if (req.method === "POST" && parts.length === 1)
            return json(res, store.public(jobs.create(await body(req))), 202);
          if (req.method === "GET" && parts.length === 2)
            return json(res, store.public(jobs.get(parts[1])));
          if (req.method === "POST" && parts[2] === "refresh") {
            await body(req);
            return json(res, store.public(await jobs.refresh(parts[1])));
          }
          if (req.method === "POST" && parts[2] === "cancel") {
            await body(req);
            return json(res, store.public(await jobs.cancel(parts[1])));
          }
        }
        throw error("接口不存在", 404);
      }
      if (!["GET", "HEAD"].includes(req.method)) throw error("方法不支持", 405);
      if (!distDir) throw error("前端尚未构建", 404);
      const root = resolve(distDir);
      let file = resolve(root, "." + path);
      if (file !== root && !file.startsWith(root + sep))
        throw error("路径无效", 403);
      if (!existsSync(file) || !statSync(file).isFile()) {
        if (path.startsWith("/assets/")) throw error("静态资源不存在", 404);
        file = resolve(root, "index.html");
      }
      if (!existsSync(file)) throw error("前端尚未构建", 404);
      res.writeHead(200, {
        "Content-Type": mimeForName(file),
        "Cache-Control": file.endsWith("index.html")
          ? "no-cache"
          : "public, max-age=0",
        "X-Content-Type-Options": "nosniff",
      });
      if (req.method === "HEAD") {
        res.end();
        return;
      }
      createReadStream(file)
        .on("error", () => res.destroy())
        .pipe(res);
    } catch (err) {
      if (!res.headersSent)
        json(
          res,
          { error: store.public(err.message || "连接服务发生错误") },
          err.status || 500,
        );
      else res.destroy();
    }
  });
  return {
    server,
    store,
    jobs,
    async close() {
      await onboarding.close();
      await Promise.all(providers.map((provider) => provider.close?.()));
      await runtime.close();
      if (server.listening) {
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
      }
    },
  };
}
