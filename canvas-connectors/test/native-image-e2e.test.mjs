import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { createConnectorServer } from "../src/server.mjs";
import { createLocalCliProviders } from "../src/providers/local-cli.mjs";

// Real local child process and HTTP/file flow, with a deliberately offline Codex fixture.
// No official CLI, account, remote API or generation is invoked by this test.
test("offline native image travels from HTTP job through child process to persisted downloadable file", async (t) => {
  const home = await mkdtemp(join(tmpdir(), "canvas-native-e2e-"));
  const bin = join(home, ".local/bin");
  await mkdir(bin, { recursive: true });
  const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4AWP4DwQACfsD/c8LaHIAAAAASUVORK5CYII=";
  const command = join(bin, process.platform === "win32" ? "codex.cjs" : "codex");
  await writeFile(command, `#!${process.execPath}
const fs = require('node:fs');
const path = require('node:path');
const allArgs = process.argv.slice(2);
const args = allArgs.slice(0, allArgs.indexOf('-c') < 0 ? allArgs.length : allArgs.indexOf('-c'));
if (args.join(' ') === '--help') console.log('Offline Codex fixture');
else if (args.join(' ') === 'features list') console.log('image_generation stable true');
else if (args.join(' ') === 'login status') console.error('Logged in using ChatGPT');
else if (args[0] === 'app-server') {
  require('node:readline').createInterface({input:process.stdin}).on('line', line => {
    const request=JSON.parse(line);
    if(request.method==='initialize') console.log(JSON.stringify({id:request.id,result:{userAgent:'offline'}}));
    else if(request.method==='model/list') console.log(JSON.stringify({id:request.id,result:{data:[{id:'directory-record-not-a-cli-model',model:'fixture-driver',isDefault:true,defaultReasoningEffort:'low',supportedReasoningEfforts:[{reasoningEffort:'low'}]}],nextCursor:null}}));
    else if(request.method!=='initialized') process.exit(9);
  });
}
else if (args[0] === 'exec') {
  let prompt = ''; process.stdin.on('data', chunk => prompt += chunk);
  process.stdin.on('end', () => {
    if (!prompt.includes('offline fixture request') || !allArgs.includes('--model=fixture-driver') || !allArgs.includes('model_reasoning_effort=\"low\"')) process.exit(2);
    const id = 'a0f5bf8e-1cb0-4b3e-bb6d-67125e131892';
    const dir = path.join(process.env.CODEX_HOME, 'generated_images', id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'call_1.png'), Buffer.from('${pngBase64}', 'base64'));
    fs.appendFileSync(path.join(process.env.CODEX_HOME, 'fixture-count'), '1');
    console.log(JSON.stringify({type:'thread.started',thread_id:id}));
    console.log(JSON.stringify({type:'turn.completed',usage:{input_tokens:0,output_tokens:0}}));
  });
} else process.exit(2);
`, { mode: 0o700 });
  if (process.platform === "win32") await writeFile(join(bin, "codex.cmd"), `@"${process.execPath}" "%~dp0codex.cjs" %*\r\n`);
  const dataDir = join(home, "data");
  const app = await createConnectorServer({
    dataDir,
    providersFactory: (ctx) => createLocalCliProviders({ ...ctx, homeDir: home, env: { ...process.env, CODEX_HOME: join(home, ".codex"), PATH: bin } }),
  });
  t.after(async () => { await app.close(); await rm(home, { recursive: true, force: true }); });
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const request = async (path, body) => { const response = await fetch(`${origin}/api/connectors${path}`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body || {}) }); const text = await response.text(); assert.ok(text, `Empty HTTP ${response.status} at ${path}`); return { json: async () => JSON.parse(text) }; };
  const checked = await (await request("/providers/codex-cli/check")).json();
  assert.equal(checked.state, "ready");
  assert.equal(checked.details.loginState, "authenticated");
  assert.equal(checked.details.imageDriverModel, "fixture-driver");
  assert.equal(checked.details.imageDriverReasoning, "low");
  const listed = await (await fetch(origin + "/api/connectors/providers")).json();
  assert.equal(listed.providers.find((provider) => provider.id === "codex-cli").details.loginState, "authenticated");
  const input = { requestId: "offline-native-once", provider: "codex-cli", preset: { id: "native", name: "Offline", provider: "codex-cli", action: "image", params: { count: 1, size: "1024x1024", quality: "high" } }, prompt: "offline fixture request", inputs: [] };
  const initial = await (await request("/jobs", input)).json();
  let job = initial;
  for (let i = 0; i < 200 && job.status !== "succeeded"; i++) {
    await delay(5);
    job = await (await request(`/jobs/${initial.id}/refresh`)).json();
    assert.notEqual(job.status, "failed", job.message);
  }
  assert.equal(job.status, "succeeded", job.message);
  assert.equal(job.outputs.length, 1);
  assert.equal(job.outputs[0].kind, "image");
  const file = await fetch(origin + job.outputs[0].url);
  assert.equal(file.headers.get("content-type"), "image/png");
  assert.deepEqual(Buffer.from(await file.arrayBuffer()), Buffer.from(pngBase64, "base64"));
  assert.equal((await (await request("/jobs", input)).json()).id, initial.id);
  assert.equal(await readFile(join(home, ".codex/fixture-count"), "utf8"), "1");
  const saved = JSON.parse(await readFile(join(dataDir, "jobs.json"), "utf8"));
  assert.equal(saved[initial.id].outputs[0].id, job.outputs[0].id);
});
