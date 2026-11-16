import test from "node:test";
import { get as httpGet } from "node:http";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createConnectorServer } from "../src/server.mjs";
import { createLocalCliProviders } from "../src/providers/local-cli.mjs";

async function setup(t, extra = {}) {
  const dataDir = await mkdtemp(join(tmpdir(), "canvas-connectors-test-"));
  let submits = 0;
  const provider = {
    id: "fake",
    name: "Offline fixture",
    auth: "api",
    billing: "No charge",
    docs: "",
    fields: [{ key: "apiKey", label: "Key", secret: true }],
    actions: [{ id: "image", label: "Image", output: "image" }],
    status: async (config) => ({
      state: config.apiKey ? "configured" : "not-connected",
      message: "fixture",
    }),
    check: async (config) => ({
      state: "ready",
      message: "fixture",
      details: { token: config.apiKey },
    }),
    submit: async () => {
      submits++;
      return { remoteId: "remote-1", status: "queued" };
    },
    query: async () => ({
      status: "succeeded",
      outputs: [
        { url: "https://assets.example.test/image.png", kind: "image" },
      ],
    }),
  };
  const app = await createConnectorServer({
    dataDir,
    providersFactory: () => [provider],
    fetch: async () =>
      new Response(new Uint8Array([137, 80, 78, 71]), {
        headers: { "Content-Type": "image/png" },
      }),
    ...extra,
  });
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const call = (path, options = {}) =>
    fetch(origin + "/api/connectors" + path, {
      ...options,
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });
  t.after(async () => {
    await app.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  return { app, call, origin, dataDir, provider, submits: () => submits };
}
const input = {
  requestId: "request-1",
  provider: "fake",
  preset: {
    id: "preset-1",
    name: "Fixture",
    provider: "fake",
    action: "image",
  },
  prompt: "test",
  inputs: [],
};

test("provider summaries preserve field metadata and never return secret input values", async (t) => {
  const x = await setup(t);
  x.provider.fields.push(
    { key: "accessPassword", label: "Password", secret: true },
    { key: "endpoint", label: "Endpoint", secret: false },
  );
  for (const saved of [false, true]) {
    x.app.store.configs.fake = { apiKey: saved ? "fixture-api-key" : "", accessPassword: saved ? "fixture-password" : "", endpoint: saved ? "https://example.test/fixture-api-key" : "https://example.test" };
    const { providers: [provider] } = await (await x.call("/providers")).json();
    assert.deepEqual(provider.fields.map(field => field.secret), [true, true, false]);
    assert.equal(provider.config.apiKey, "");
    assert.equal(provider.config.accessPassword, "");
    assert.equal(provider.config.endpoint, saved ? "https://example.test/[已隐藏]" : "https://example.test");
    assert.deepEqual(provider.configuredFields, saved ? ["apiKey", "accessPassword", "endpoint"] : ["endpoint"]);
    assert.ok(!JSON.stringify(provider).includes("fixture-api-key"));
    assert.ok(!JSON.stringify(provider).includes("fixture-password"));
  }
});

test("detect refreshes local installation after a cached check without authorizing or generating", async (t) => {
  const x = await setup(t);
  await x.call('/providers/fake/check', { method: 'POST', body: '{}' });
  x.provider.status = async () => ({ state: 'not-installed', message: 'tool removed' });
  const cached = await (await x.call('/providers')).json();
  assert.equal(cached.providers[0].state, 'ready');
  const result = await (await x.call('/providers/fake/detect', { method: 'POST', body: '{}' })).json();
  assert.equal(result.state, 'not-installed');
  const refreshed = await (await x.call('/providers')).json();
  assert.equal(refreshed.providers[0].state, 'not-installed');
  assert.equal(x.submits(), 0);
});

test("onboarding HTTP flow verifies membership, exposes results after refresh, and rejects cross-origin setup", async (t) => {
  let authenticated = false;
  const state = () => ({ state: authenticated ? 'ready' : 'configured', details: { loginState: authenticated ? 'authenticated' : 'not-authenticated', authMethod: authenticated ? 'chatgpt' : 'unknown', imageAvailable: authenticated } });
  const provider = { id: 'codex-cli', name: 'Codex', fields: [], actions: [], status: async () => state(), check: async () => state(), login: async () => { authenticated = true; } };
  const x = await setup(t, { providersFactory: () => [provider] });
  assert.equal((await x.call('/onboarding/codex-cli', { method: 'POST', body: '{}', headers: { Origin: 'https://other.example' } })).status, 403);
  const started = await (await x.call('/onboarding/codex-cli', { method: 'POST', body: '{}' })).json();
  assert.ok(started.id);
  let result;
  do { result = await (await x.call(`/onboarding/${started.id}`)).json(); } while (result.status === 'running');
  assert.equal(result.status, 'succeeded');
  assert.equal(result.provider.details.authMethod, 'chatgpt');
  const list = await (await x.call('/onboarding')).json();
  assert.equal(list.tasks[0].status, 'succeeded');
  const providers = await (await x.call('/providers')).json();
  assert.equal(providers.providers[0].details.loginState, 'authenticated');
});

test("same requestId submits once and persists the actual remote task", async (t) => {
  const x = await setup(t);
  const a = await (
    await x.call("/jobs", { method: "POST", body: JSON.stringify(input) })
  ).json();
  const b = await (
    await x.call("/jobs", { method: "POST", body: JSON.stringify(input) })
  ).json();
  await x.app.jobs.waitForIdle();
  assert.equal(a.id, b.id);
  assert.equal(x.submits(), 1);
  assert.equal(x.app.store.jobs[a.id].remoteId, "remote-1");
  const refreshed = await (
    await x.call(`/jobs/${a.id}/refresh`, { method: "POST", body: "{}" })
  ).json();
  assert.equal(refreshed.status, "succeeded");
  assert.equal(refreshed.outputs.length, 1);
  assert.match(refreshed.outputs[0].url, /^\/api\/connectors\/files\//);
  const media = await fetch(x.origin + refreshed.outputs[0].url);
  assert.equal(media.status, 200);
  assert.equal((await media.arrayBuffer()).byteLength, 4);
});

test("refresh preserves a local CLI validation failure before a native run exists", async (t) => {
  let launches = 0;
  const x = await setup(t, { providersFactory: ctx => {
    const provider = createLocalCliProviders({ ...ctx, spawn() { launches++; throw new Error("Unexpected CLI launch"); } }).find(p => p.id === "antigravity-cli");
    provider.check = async () => ({ state: "ready", details: { executable: join(ctx.dataDir, "agy.exe"), imageAvailable: true } });
    return [provider];
  } });
  const request = { ...input, provider: "antigravity-cli", preset: { ...input.preset, provider: "antigravity-cli", params: { quality: "standard" } } };
  const created = await (await x.call("/jobs", { method: "POST", body: JSON.stringify(request) })).json();
  await x.app.jobs.waitForIdle();
  const before = structuredClone(x.app.store.jobs[created.id]);
  assert.equal(before.status, "interrupted");
  assert.match(before.message, /图片质量仅支持/);
  assert.equal(before.remoteId, undefined);
  const refreshed = await (await x.call(`/jobs/${created.id}/refresh`, { method: "POST", body: "{}" })).json();
  assert.equal(refreshed.status, before.status);
  assert.equal(refreshed.message, before.message);
  assert.equal(refreshed.updatedAt, before.updatedAt);
  assert.equal(launches, 0);
});

test("refresh without a remote ID preserves the original submission failure", async (t) => {
  const x = await setup(t);
  x.provider.submit = async () => { throw new Error("首帧素材未被 CLI 接收"); };
  const created = await (await x.call("/jobs", { method: "POST", body: JSON.stringify(input) })).json();
  await x.app.jobs.waitForIdle();
  const before = structuredClone(x.app.jobs.get(created.id));
  assert.match(before.message, /首帧素材/);
  const refreshed = await x.app.jobs.refresh(created.id);
  assert.equal(refreshed.message, before.message);
  assert.equal(refreshed.updatedAt, before.updatedAt);
  assert.equal(refreshed.status, "interrupted");
});

test("workspace HTTP records are shared, revision checked, and reject foreign writes", async (t) => {
  const x = await setup(t);
  const path = "/workspace/canvas_state/infinite-canvas%3Acanvas_store";
  const saved = await (await x.call(path, { method: "PUT", body: JSON.stringify({ revision: null, value: "project snapshot" }) })).json();
  const reopened = await (await x.call(path)).json();
  assert.equal(reopened.record.value, "project snapshot");
  assert.equal(reopened.record.revision, saved.revision);
  assert.equal((await x.call(path, { method: "PUT", body: JSON.stringify({ revision: null, value: "stale" }) })).status, 409);
  const foreign = await fetch(x.origin + "/api/connectors" + path, { method: "PUT", headers: { Origin: "https://example.test", "Content-Type": "application/json" }, body: JSON.stringify({ revision: saved.revision, value: "foreign" }) });
  assert.equal(foreign.status, 403);
});

test("config edits preserve secrets and public responses never echo them", async (t) => {
  const x = await setup(t);
  const secret = "test-only-private-value";
  await x.call("/providers/fake", {
    method: "PUT",
    body: JSON.stringify({ config: { apiKey: secret } }),
  });
  await x.call("/providers/fake", {
    method: "PUT",
    body: JSON.stringify({ config: { apiKey: "" } }),
  });
  assert.equal(x.app.store.configs.fake.apiKey, secret);
  for (const [path, options] of [
    ["/providers", {}],
    ["/providers/fake/check", { method: "POST", body: "{}" }],
  ]) {
    const body = await (await x.call(path, options)).text();
    assert.ok(!body.includes(secret));
  }
});

test("foreign origins and missing Origin cannot mutate the local service", async (t) => {
  const x = await setup(t);
  assert.equal((await x.call("/agent/bootstrap", { method: "POST", headers: { Origin: "https://untrusted.example" }, body: "{}" })).status, 403);
  assert.equal(
    (
      await x.call("/jobs", {
        method: "POST",
        headers: { Origin: "https://untrusted.example" },
        body: JSON.stringify(input),
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(x.origin + "/api/connectors/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })
    ).status,
    403,
  );
  assert.equal(x.submits(), 0);
});

test("invalid actions and credential-bearing task params never submit", async (t) => {
  const x = await setup(t);
  for (const preset of [
    { ...input.preset, action: "arbitrary-shell" },
    { ...input.preset, params: { apiKey: "not-for-export" } },
    { ...input.preset, params: { accessPassword: "not-for-export" } },
  ]) {
    assert.equal(
      (
        await x.call("/jobs", {
          method: "POST",
          body: JSON.stringify({ ...input, preset }),
        })
      ).status,
      400,
    );
  }
  assert.equal(x.submits(), 0);
});

test("prototype names are not task IDs and access passwords are redacted", async (t) => {
  const x = await setup(t);
  for (const id of ["__proto__", "constructor", "toString"]) {
    assert.equal(
      (await x.call(`/jobs/${id}/refresh`, { method: "POST", body: "{}" }))
        .status,
      404,
    );
  }
  assert.equal(Object.prototype.message, undefined);
  x.app.store.configs.fake = { accessPassword: "test-only-password" };
  assert.ok(
    !JSON.stringify(
      x.app.store.public({
        accessPassword: "test-only-password",
        message: "test-only-password",
      }),
    ).includes("test-only-password"),
  );
});

test("reload recovers remote tasks but never resubmits an uncertain submission", async (t) => {
  const x = await setup(t);
  x.app.store.jobs.uncertain = {
    ...input,
    id: "uncertain",
    status: "submitting",
    outputs: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  x.app.store.saveJobs();
  const restored = await createConnectorServer({
    dataDir: x.dataDir,
    providersFactory: () => [x.provider],
  });
  assert.equal(restored.store.jobs.uncertain.status, "interrupted");
  assert.equal(x.submits(), 0);
  await restored.close();
});

test("query errors preserve the remote task and recover without another submission", async (t) => {
  const x = await setup(t);
  const job = x.app.jobs.create(input);
  await x.app.jobs.waitForIdle();
  const query = x.provider.query;
  x.provider.query = async () => { throw new Error("offline query"); };
  const failed = await x.app.jobs.refresh(job.id);
  assert.equal(failed.status, "query_failed");
  assert.equal(failed.remoteId, "remote-1");
  assert.equal(x.submits(), 1);
  x.provider.query = query;
  assert.equal((await x.app.jobs.refresh(job.id)).status, "succeeded");
  assert.equal(x.submits(), 1);
});

test("a query failure while recovering downloads is classified as query failure and retains saved files", async (t) => {
  const x = await setup(t);
  const job = x.app.jobs.create(input);
  await x.app.jobs.waitForIdle();
  Object.assign(job, { status: "save_failed", outputs: [{ id: "saved-file" }] });
  x.provider.query = async () => { throw new Error("query offline"); };
  const failed = await x.app.jobs.refresh(job.id);
  assert.equal(failed.status, "query_failed");
  assert.equal(failed.remoteId, "remote-1");
  assert.deepEqual(failed.outputs, [{ id: "saved-file" }]);
  assert.equal(x.submits(), 1);
});

test("partial download survives reopening and retries only missing outputs of the same task", async (t) => {
  const downloads = [];
  let fail = true;
  const download = async url => {
    downloads.push(url);
    return url.endsWith("second.png") && fail ? new Response("expired", { status: 403 }) : new Response(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "image/png" } });
  };
  const x = await setup(t, { fetch: download });
  x.provider.query = async () => ({ status: "succeeded", outputs: ["first", "second"].map(name => ({ url: `https://assets.example.test/${name}.png`, kind: "image" })) });
  const job = x.app.jobs.create(input);
  await x.app.jobs.waitForIdle();
  const failed = await x.app.jobs.refresh(job.id);
  assert.equal(failed.status, "save_failed");
  assert.equal(failed.outputs.length, 1);
  const firstFile = failed.outputs[0].id;
  assert.equal(failed.remoteId, "remote-1");
  const restored = await createConnectorServer({ dataDir: x.dataDir, providersFactory: () => [x.provider], fetch: download });
  t.after(() => restored.close());
  assert.equal(restored.jobs.get(job.id).status, "save_failed");
  fail = false;
  const [a, b] = await Promise.all([restored.jobs.refresh(job.id), restored.jobs.refresh(job.id)]);
  assert.equal(a.status, "succeeded");
  assert.equal(a.outputs.length, 2);
  assert.equal(a.outputs[0].id, firstFile);
  assert.deepEqual(a.outputs, b.outputs);
  assert.equal(downloads.filter(url => url.endsWith("first.png")).length, 1);
  assert.equal(downloads.filter(url => url.endsWith("second.png")).length, 2);
  assert.equal(x.submits(), 1);
});

test("saving is visible while files are downloading and cannot be cancelled as remote generation", async (t) => {
  let release, entered;
  const started = new Promise(resolve => { entered = resolve; });
  const pending = new Promise(resolve => { release = resolve; });
  const x = await setup(t, { fetch: async () => { entered(); await pending; return new Response("image", { headers: { "Content-Type": "image/png" } }); } });
  const job = x.app.jobs.create(input);
  await x.app.jobs.waitForIdle();
  const refresh = x.app.jobs.refresh(job.id);
  await started;
  const status = x.app.jobs.get(job.id).status;
  let cancels = 0;
  x.provider.cancel = async () => { cancels++; return { status: "cancelled" }; };
  try { assert.equal((await x.app.jobs.cancel(job.id)).status, "saving"); }
  finally { release(); }
  await refresh;
  assert.equal(status, "saving");
  assert.equal(cancels, 0);
  assert.equal(x.app.jobs.get(job.id).status, "succeeded");
});

test("reopening during saving retains the partial files and original task identity", async (t) => {
  const x = await setup(t);
  x.app.store.jobs.saving = { ...input, id: "saving", remoteId: "original", status: "saving", outputs: [{ id: "already-saved" }], outputSources: { source: "already-saved" } };
  x.app.store.saveJobs();
  const restored = await createConnectorServer({ dataDir: x.dataDir, providersFactory: () => [x.provider] });
  t.after(() => restored.close());
  const recovered = restored.jobs.get("saving");
  assert.equal(recovered.status, "save_failed");
  assert.equal(recovered.remoteId, "original");
  assert.deepEqual(recovered.outputs, [{ id: "already-saved" }]);
  assert.equal(x.submits(), 0);
});

test("cancellation waits for an active query and still reaches the remote provider", async (t) => {
  const x = await setup(t);
  let resolveQuery,
    queryStarted,
    cancels = 0;
  const started = new Promise((resolve) => {
    queryStarted = resolve;
  });
  x.provider.query = () => {
    queryStarted();
    return new Promise((resolve) => {
      resolveQuery = resolve;
    });
  };
  x.provider.cancel = async () => {
    cancels++;
    return { status: "cancelled" };
  };
  const job = x.app.jobs.create(input);
  await x.app.jobs.waitForIdle();
  const query = x.app.jobs.refresh(job.id);
  await started;
  const cancel = x.app.jobs.cancel(job.id);
  resolveQuery({ status: "running" });
  await query;
  assert.equal((await cancel).status, "cancelled");
  assert.equal(cancels, 1);
});

test("only providers with durable local recovery can refresh without a saved run ID", async (t) => {
  const x = await setup(t);
  const job = { ...input, id: "recover-local", status: "interrupted", outputs: [] };
  x.app.store.jobs[job.id] = job;
  let queries = 0;
  x.provider.query = async () => { queries++; return { remoteId: "saved-local-run", status: "running" }; };
  await x.app.jobs.refresh(job.id);
  assert.equal(queries, 0);
  x.provider.queryWithoutRemoteId = true;
  const recovered = await x.app.jobs.refresh(job.id);
  assert.equal(recovered.remoteId, "saved-local-run");
  assert.equal(recovered.status, "running");
  assert.equal(queries, 1);
  assert.equal(x.submits(), 0);
});


test("cross-site top-level navigation can open the local UI but cannot read local APIs", async (t) => {
  const distDir = await mkdtemp(join(tmpdir(), "canvas-navigation-"));
  await writeFile(join(distDir, "index.html"), "<!doctype html><title>Canvas test</title>");
  t.after(() => rm(distDir, { recursive: true, force: true }));
  const { origin } = await setup(t, { distDir });
  const headers = { "Sec-Fetch-Site": "cross-site", "Sec-Fetch-Mode": "navigate", "Sec-Fetch-Dest": "document" };
  // fetch() enforces sec-fetch-mode=cors; use HTTP to model actual document navigation.
  const navigate = (path) => new Promise((resolve, reject) => httpGet(origin + path, { headers }, (res) => {
    let body = ""; res.setEncoding("utf8"); res.on("data", (chunk) => { body += chunk; });
    res.on("end", () => resolve({ status: res.statusCode, text: async () => body }));
  }).on("error", reject));
  const page = await navigate("/");
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Canvas test/);
  assert.equal((await navigate("/api/connectors/providers")).status, 403);
  assert.equal((await navigate("/api%2fconnectors/providers")).status, 403);
  assert.equal((await fetch(origin + "/", { headers: { ...headers, "Sec-Fetch-Mode": "cors", "Sec-Fetch-Dest": "empty" } })).status, 403);
});

test("cancel signals an abortable preflight before waiting for submit and never loses cancellation", async (t) => {
  const x = await setup(t);
  let signal, release, started;
  const began = new Promise((resolve) => { started = resolve; });
  x.provider.abortableSubmit = true;
  x.provider.submit = (_config, _job, options) => new Promise((resolve) => {
    signal = options?.signal;
    release = () => resolve({ remoteId: "preflight-only", status: signal?.aborted ? "cancelled" : "queued" });
    signal?.addEventListener("abort", release, { once: true });
    started();
  });
  let cancelCalls = 0;
  x.provider.cancel = async () => { cancelCalls++; return { status: "cancelled" }; };
  const job = x.app.jobs.create(input);
  await began;
  const cancellation = x.app.jobs.cancel(job.id);
  try { assert.equal(signal?.aborted, true); } finally { release(); }
  assert.equal((await cancellation).status, "cancelled");
  assert.equal(cancelCalls, 0);
  assert.equal(x.app.jobs.get(job.id).status, "cancelled");
});

test("immediate cancel reaches preflight even before submit starts", async (t) => {
  const x = await setup(t);
  x.provider.abortableSubmit = true;
  x.provider.submit = async (_config, _job, {signal}) => {
    assert.equal(signal.aborted, true);
    return { remoteId: "never-started", status: "cancelled" };
  };
  x.provider.cancel = async () => { throw new Error("should not cancel a completed preflight"); };
  const job = x.app.jobs.create(input);
  assert.equal((await x.app.jobs.cancel(job.id)).status, "cancelled");
});
