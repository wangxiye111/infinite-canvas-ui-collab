import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { once } from "node:events";
import { createRuntime } from "../src/runtime.mjs";
import { createLocalCliProviders } from "../src/providers/local-cli.mjs";
import { kling } from "../src/providers/cli.mjs";
import { spawnCli } from "../src/cli-process.mjs";

const windows = { skip: process.platform !== "win32" };

test("runtime honors an explicit CLI path and never falls back after a missing path", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "canvas explicit tool-"));
  const runtime = createRuntime(directory);
  t.after(async () => { await runtime.close(); await rm(directory, { recursive: true, force: true }); });
  assert.equal(await runtime.which("dreamina", process.execPath), process.execPath);
  assert.equal(await runtime.which("dreamina", join(directory, "missing")), null);
  await assert.rejects(runtime.runCli("dreamina", ["--version"], { executable: join(directory, "missing") }), /未安装|未找到/);
  await assert.rejects(runtime.which("dreamina", "relative/tool"), /绝对路径/);
  assert.equal(await runtime.which("unknown", process.execPath), null);
  const value = "中文 空格\n保持 & | % 内容";
  const result = await runtime.runCli("dreamina", ["-e", "console.log(process.argv[1])", value], { executable: process.execPath });
  assert.equal(result.code, 0);
  assert.equal(result.stdout.trim(), value);
});

test("Windows Kling validates the npm shim target package before any account command", windows, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "canvas Windows package-"));
  const bin = join(directory, "tools", "node_modules", ".bin");
  const packageDir = join(directory, "tools", "node_modules", "@klingai", "cli-cn");
  await mkdir(bin, { recursive: true });
  await mkdir(packageDir, { recursive: true });
  await writeFile(join(packageDir, "package.json"), JSON.stringify({ name: "@klingai/cli-cn" }));
  await writeFile(join(packageDir, "cli.cjs"), 'console.log(JSON.stringify({ok:true,body:process.argv[2]==="who_am_i"?{user:{userId:"offline"},availableModels:{}}:{availableRemainCredits:0}}))');
  await writeFile(join(bin, "kling.cmd"), `@"${process.execPath}" "%~dp0\\..\\@klingai\\cli-cn\\cli.cjs" %*\r\n`);
  const runtime = createRuntime(directory);
  t.after(async () => { await runtime.close(); await rm(directory, { recursive: true, force: true }); });
  const provider = kling(runtime);
  assert.equal((await provider.check()).state, "ready");
  await writeFile(join(packageDir, "package.json"), JSON.stringify({ name: "@klingai/cli-global" }));
  await assert.rejects(provider.check(), /全球可灵/);
});

test("Windows runtime discovers npm cmd shims and preserves Chinese and shell metacharacters", windows, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "canvas Windows 命令-"));
  const bin = join(directory, "tools", "node_modules", ".bin");
  await mkdir(bin, { recursive: true });
  await writeFile(join(bin, "fixture.cjs"), "console.log(JSON.stringify(process.argv.slice(2)))");
  await writeFile(join(bin, "kling.cmd"), `@"${process.execPath}" "%~dp0\\fixture.cjs" %*\r\n`);
  const runtime = createRuntime(directory);
  t.after(async () => { await runtime.close(); await rm(directory, { recursive: true, force: true }); });
  assert.equal((await runtime.which("kling")).toLowerCase(), join(bin, "kling.cmd").toLowerCase());
  const args = ["中文 空格", "a&b|c<d>e^f", 'quoted "text"', "(parentheses)", "%TEMP%", "!literal!", "第一行\n第二行"];
  const result = await runtime.runCli("kling", args);
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), args);
  await writeFile(join(bin, "dreamina.cmd"), `@"${process.execPath}" "%~dp0fixture.cjs" %*\r\n`);
  const simpleArgs = args.slice(0, -1);
  assert.deepEqual(JSON.parse((await runtime.runCli("dreamina", simpleArgs)).stdout), simpleArgs);
  await assert.rejects(runtime.runCli("dreamina", ["第一行\n第二行"]), /不支持多行参数/);
});

test("Windows local CLI finds exe extensions and cancels the owned cmd and Node process tree", windows, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "canvas Windows cancel-"));
  const bin = join(directory, ".local", "bin");
  await mkdir(bin, { recursive: true });
  await writeFile(join(bin, "codex.exe"), "discovery only, never executed");
  await writeFile(join(bin, "fixture.cjs"), "console.log(process.pid); setInterval(() => {}, 1000)");
  await writeFile(join(bin, "gemini.cmd"), `@"${process.execPath}" "%~dp0fixture.cjs" %*\r\n`);
  let started;
  const providers = createLocalCliProviders({
    homeDir: directory, dataDir: directory,
    env: { ...process.env, PATH: bin },
    spawn(...args) {
      const child = spawnCli(...args);
      started = once(child.stdout, "data");
      return child;
    },
  });
  t.after(async () => { await Promise.all(providers.map((provider) => provider.close())); await rm(directory, { recursive: true, force: true }); });
  assert.equal((await providers[0].status({})).details.executable.toLowerCase(), join(bin, "codex.exe").toLowerCase());
  assert.equal((await providers[0].status({ executable: join(bin, "codex.exe") })).state, "configured");
  const provider = providers.find((item) => item.id === "gemini-cli");
  const job = { id: "offline-cancel", provider: provider.id, preset: { provider: provider.id, action: "text", params: {} }, prompt: "offline fixture", inputs: [] };
  assert.equal((await provider.submit({}, job)).status, "running");
  const pid = Number(String((await started)[0]).trim());
  assert.ok(Number.isSafeInteger(pid) && pid > 0);
  assert.equal((await provider.cancel({}, job)).status, "cancelled");
  assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
});
