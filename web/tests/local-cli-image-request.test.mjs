import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) }, moduleCache: false });
const { runLocalCli, localCliApi, LOCAL_CODEX_IMAGE_MODEL } = await jiti.import("../src/services/api/local-cli.ts");
const originalFetch = globalThis.fetch;

test("stopping the wait during result saving never asks the provider to cancel generation", async () => {
    const controller = new AbortController();
    const calls = [];
    globalThis.fetch = async (url, init) => {
        calls.push(String(url));
        controller.abort();
        return Response.json({ id: "saving-job", requestId: JSON.parse(init.body).requestId, provider: "codex-cli", status: "saving", outputs: [] });
    };
    await assert.rejects(runLocalCli({ engine: "codex-cli", action: "image", prompt: "offline" }, { signal: controller.signal }), /停止等待.*保存|保存.*停止等待/);
    assert.deepEqual(calls, ["/api/connectors/jobs"]);
});

test("query and save failures name the original task without resubmission", async () => {
    for (const status of ["query_failed", "save_failed"]) {
        let calls = 0;
        globalThis.fetch = async (_url, init) => {
            calls++;
            return Response.json({ id: "recover-job", requestId: JSON.parse(init.body).requestId, provider: "codex-cli", status, message: "offline", outputs: [] });
        };
        await assert.rejects(runLocalCli({ engine: "codex-cli", action: "image", prompt: "offline" }), /recover-job/);
        assert.equal(calls, 1);
    }
});
afterEach(() => { globalThis.fetch = originalFetch; });

test("Codex image default alias is never sent as the CLI driver model", async () => {
    let submission;
    globalThis.fetch = async (_url, init) => {
        submission = JSON.parse(init.body);
        return Response.json({ error: "blocked test submission" }, { status: 400 });
    };
    await assert.rejects(runLocalCli({ engine: "codex-cli", action: "image", prompt: "test", model: LOCAL_CODEX_IMAGE_MODEL }), /blocked test submission/);
    assert.equal(submission.preset.model, undefined);
});

test("explicit driver selections and other engines are not silently rewritten", async () => {
    let submission;
    globalThis.fetch = async (_url, init) => {
        submission = JSON.parse(init.body);
        return Response.json({ error: "blocked test submission" }, { status: 400 });
    };
    for (const input of [{ engine: "codex-cli", action: "image", model: "gpt-5.4" }, { engine: "gemini-cli", action: "image", model: LOCAL_CODEX_IMAGE_MODEL }, { engine: "codex-cli", action: "text", model: LOCAL_CODEX_IMAGE_MODEL }]) {
        await assert.rejects(runLocalCli({ ...input, prompt: "test" }), /blocked test submission/);
        assert.equal(submission.preset.model, input.model);
    }
});

test("an unavailable local service gives setup guidance rather than an API-key error", async () => {
    globalThis.fetch = async () => { throw new TypeError("Failed to fetch"); };
    await assert.rejects(localCliApi.check("codex-cli"), /本地连接服务不可用/);
});

test("Antigravity image alias is omitted while explicit model choices remain visible to the backend", async () => {
    let submission;
    globalThis.fetch = async (_url, init) => {
        submission = JSON.parse(init.body);
        return Response.json({ error: "blocked test submission" }, { status: 400 });
    };
    for (const [action, model, expected] of [["image", "antigravity-image-default", undefined], ["image", "gemini-nano-banana-2.1", "gemini-nano-banana-2.1"], ["text", "antigravity-image-default", "antigravity-image-default"]]) {
        await assert.rejects(runLocalCli({ engine: "antigravity-cli", action, model, prompt: "test" }), /blocked test submission/);
        assert.equal(submission.preset.model, expected);
    }
});

test("Google login and its manual status check use distinct connector endpoints", async () => {
    assert.equal(typeof localCliApi.login, "function");
    const calls = [];
    globalThis.fetch = async (url, init) => { calls.push([url, init?.method || "GET"]); return Response.json({ id: "google-login", provider: "antigravity-cli", status: "running" }); };
    const login = await localCliApi.login("antigravity-cli");
    await localCliApi.loginStatus(login.id);
    assert.deepEqual(calls, [["/api/connectors/providers/antigravity-cli/login", "POST"], ["/api/connectors/logins/google-login", "GET"]]);
});
