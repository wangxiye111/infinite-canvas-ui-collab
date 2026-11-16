import { afterEach, expect, test } from "bun:test";
import { localCliApi, localCliOutputUrl, runLocalCli } from "../src/services/api/local-cli";

const originalFetch = globalThis.fetch;
const originalReader = Object.getOwnPropertyDescriptor(globalThis, "FileReader");
afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalReader) Object.defineProperty(globalThis, "FileReader", originalReader);
    else Reflect.deleteProperty(globalThis, "FileReader");
});
const finished = (requestId: string, status = "succeeded") => ({ id: "job-1", requestId, provider: "codex-cli", status, outputs: [{ id: "answer", url: "/api/connectors/files/answer", kind: "text", mimeType: "text/plain", name: "answer.txt" }] });

test("CLI submission sends the explicit engine and model without API credentials", async () => {
    let submission: any;
    globalThis.fetch = (async (url, init) => {
        if (String(url).endsWith("/jobs")) { submission = JSON.parse(String(init?.body)); return Response.json(finished(submission.requestId)); }
        return new Response("完成");
    }) as typeof fetch;
    const result = await runLocalCli({ engine: "gemini-cli", prompt: "你好", model: "selected-model", action: "text" });
    expect(result.text).toBe("完成");
    expect(submission.provider).toBe("gemini-cli");
    expect(submission.preset.model).toBe("selected-model");
    expect(submission.apiKey).toBeUndefined();
});

test("a lost submit response recovers the same request without resubmitting", async () => {
    let requestId = "", submissions = 0;
    globalThis.fetch = (async (url, init) => {
        if (init?.method === "POST") { submissions++; requestId = JSON.parse(String(init.body)).requestId; throw new TypeError("lost response"); }
        if (String(url).endsWith("/jobs")) return Response.json({ jobs: [finished(requestId)] });
        return new Response("恢复结果");
    }) as typeof fetch;
    const result = await runLocalCli({ engine: "codex-cli", prompt: "你好", action: "text" });
    expect(result.text).toBe("恢复结果");
    expect(submissions).toBe(1);
});

test("an uncertain submission is reported without retrying or switching providers", async () => {
    let submissions = 0;
    globalThis.fetch = (async (_url, init) => {
        if (init?.method === "POST") { submissions++; throw new TypeError("lost response"); }
        return Response.json({ jobs: [] });
    }) as typeof fetch;
    await expect(runLocalCli({ engine: "codex-cli", prompt: "你好", action: "text" })).rejects.toThrow("提交结果待核查");
    expect(submissions).toBe(1);
});

test("aborting a submitted job requests server cancellation", async () => {
    const controller = new AbortController();
    let cancelled = false;
    globalThis.fetch = (async (url, init) => {
        if (String(url).endsWith("/cancel")) { cancelled = true; return Response.json(finished("request", "cancelled")); }
        const body = JSON.parse(String(init?.body));
        controller.abort();
        return Response.json(finished(body.requestId, "running"));
    }) as typeof fetch;
    await expect(runLocalCli({ engine: "codex-cli", prompt: "你好", action: "text" }, { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(cancelled).toBe(true);
});

test("image generation cannot silently succeed with only a text result", async () => {
    globalThis.fetch = (async (_url, init) => init?.method === "POST" ? Response.json(finished(JSON.parse(String(init.body)).requestId)) : new Response("text only")) as typeof fetch;
    await expect(runLocalCli({ engine: "codex-cli", prompt: "画图", action: "image" })).rejects.toThrow("未返回图片");
});

test("failed server cancellation is reported as uncertain rather than cancelled", async () => {
    const controller = new AbortController();
    globalThis.fetch = (async (url, init) => {
        if (String(url).endsWith("/cancel")) throw new TypeError("disconnected");
        controller.abort();
        return Response.json(finished(JSON.parse(String(init?.body)).requestId, "running"));
    }) as typeof fetch;
    await expect(runLocalCli({ engine: "codex-cli", prompt: "你好", action: "text" }, { signal: controller.signal })).rejects.toThrow("取消结果待核查");
});

test("reference files are uploaded once and explicit image driver parameters are preserved", async () => {
    // Bun does not provide the browser FileReader API.
    Object.defineProperty(globalThis, "FileReader", { configurable: true, value: class {
        result = "";
        onload?: () => void;
        async readAsDataURL(blob: Blob) { this.result = `data:${blob.type};base64,${Buffer.from(await blob.arrayBuffer()).toString("base64")}`; this.onload?.(); }
    } });
    let submission: any;
    globalThis.fetch = (async (url, init) => {
        if (String(url).includes("/files?")) return Response.json({ id: "reference" });
        if (String(url).endsWith("/jobs")) {
            submission = JSON.parse(String(init?.body));
            return Response.json({ ...finished(submission.requestId), outputs: [{ id: "picture", url: "/api/connectors/files/picture", kind: "image", mimeType: "image/png" }] });
        }
        return new Response(new Uint8Array([137, 80, 78, 71]), { headers: { "Content-Type": "image/png" } });
    }) as typeof fetch;
    const result = await runLocalCli({ engine: "codex-cli", prompt: "编辑参考图", model: "gpt-5.4", action: "image", images: [new Blob(["reference"], { type: "image/png" })], size: "1024x1024", quality: "high", count: 2 });
    expect(submission.inputs).toEqual([{ fileId: "reference" }]);
    expect(submission.preset.model).toBe("gpt-5.4");
    expect(submission.preset.params).toEqual({ size: "1024x1024", quality: "high", count: 2 });
    expect(result.images[0].dataUrl).toStartWith("data:image/png;base64,");
});

test("recovery lists only CLI jobs and reads saved text without resubmission", async () => {
    const methods: string[] = [];
    globalThis.fetch = (async (url, init) => {
        methods.push(init?.method || "GET");
        if (String(url).endsWith("/jobs")) return Response.json({ jobs: [finished("saved"), { ...finished("other"), provider: "kling" }] });
        return new Response("历史结果");
    }) as typeof fetch;
    const jobs = await localCliApi.jobs();
    expect(jobs).toHaveLength(1);
    expect(await localCliApi.readJobText(jobs[0])).toBe("历史结果");
    expect(methods).toEqual(["GET", "GET"]);
});

test("recovery rejects external or non-file output links", () => {
    const output = finished("saved").outputs[0];
    expect(() => localCliOutputUrl({ ...output, kind: "text", url: "https://other.example/api/connectors/files/result" })).toThrow("不是本地连接服务文件");
    expect(() => localCliOutputUrl({ ...output, kind: "text", url: "/api/connectors/providers" })).toThrow("不是本地连接服务文件");
});
