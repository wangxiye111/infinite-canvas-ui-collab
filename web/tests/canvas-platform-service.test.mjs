import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
const jiti = createJiti(import.meta.url, { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) }, moduleCache: false });
const { submitPlatformNode, refreshPlatformNode, receivePlatformJob } = await jiti.import("../src/services/api/canvas-platform.ts");
const preset = { id: "p", name: "image", provider: "kling", action: "text_to_image", model: "actual" };
function setup() {
    let node = { id: "n", type: "image", metadata: { platformGeneration: { preset, enabled: true } } };
    let current = true;
    const calls = [];
    const session = { canvasId: "c", nodeId: "n", read: () => current ? node : null, write: patch => { node = { ...node, metadata: { ...node.metadata, ...patch } }; }, persist: async () => {} };
    const provider = { id: "kling", state: "ready", actions: [{ id: "text_to_image", requiresModel: true }] };
    const job = (body, extra = {}) => ({ id: "j", ...body, status: "queued", outputs: [], ...extra });
    const deps = {
        upload: async () => { calls.push("upload"); return { id: "file" }; },
        referenceBlob: async () => new Blob(["image"], { type: "image/png" }),
        submit: async body => { calls.push("submit"); return job(body); },
        jobs: async () => ({ jobs: [] }),
        refresh: async () => { calls.push("refresh"); return job({ ...node.metadata.platformGeneration.current, provider: "kling", canvasId: "c", nodeId: "n" }); },
        saveOutput: async output => { calls.push(`save:${output.id}`); return { ...output, content: `blob:${output.id}`, storageKey: `image:${output.id}`, bytes: 5, mimeType: "image/png" }; },
        recordJob: () => {},
    };
    return { session, provider, deps, calls, job, read: () => node, leave: () => { current = false; } };
}

test("lost submit response retains request identity and recovery never resubmits", async () => {
    const s = setup();
    let submitted;
    s.deps.submit = async body => { submitted = body; s.calls.push("submit"); throw Error("lost response"); };
    await assert.rejects(submitPlatformNode(s.session, s.provider, "prompt", [], s.deps), /lost response/);
    assert.ok(s.read().metadata.platformGeneration.current.requestId);
    assert.equal(s.read().metadata.platformGeneration.current.jobId, undefined);
    await assert.rejects(submitPlatformNode(s.session, s.provider, "prompt", [], s.deps), /已有/);
    s.deps.jobs = async () => ({ jobs: [s.job(submitted)] });
    await refreshPlatformNode(s.session, s.deps);
    assert.equal(s.read().metadata.platformGeneration.current.jobId, "j");
    assert.deepEqual(s.calls, ["submit", "refresh"]);
});

test("invalid references are rejected without uploading or submitting", async () => {
    const s = setup();
    await assert.rejects(submitPlatformNode(s.session, s.provider, "prompt", [{ kind: "image", role: "image" }], s.deps), /文生/);
    assert.deepEqual(s.calls, []);
    assert.equal(s.read().metadata.platformGeneration.current, undefined);
});

test("a workflow without prompt mapping cannot silently discard the entered prompt", async () => {
    const s = setup();
    s.session.write({ platformGeneration: { preset: { ...preset, provider: "runninghub", action: "workflow", remoteId: "workflow-id" } } });
    const provider = { id: "runninghub", state: "configured", actions: [{ id: "workflow", requiresRemoteId: true }] };
    await assert.rejects(submitPlatformNode(s.session, provider, "must not be ignored", [], s.deps), /提示词/);
    assert.deepEqual(s.calls, []);
    await submitPlatformNode(s.session, provider, "", [], s.deps);
    assert.deepEqual(s.calls, ["submit"]);
});

test("late results after changing canvas cannot write back", async () => {
    const s = setup();
    s.deps.submit = async body => { s.leave(); return s.job(body, { status: "succeeded", outputs: [{ id: "a", kind: "image" }] }); };
    await submitPlatformNode(s.session, s.provider, "prompt", [], s.deps);
    assert.deepEqual(s.calls, []);
    assert.equal(s.read().metadata.platformGeneration.current.outputs.length, 0);
});

test("request identity must be durable before submission, and storage failure prevents spending", async () => {
    const s = setup();
    s.session.persist = async () => { throw Error("storage unavailable"); };
    await assert.rejects(submitPlatformNode(s.session, s.provider, "prompt", [], s.deps), /storage unavailable/);
    assert.deepEqual(s.calls, []);
    const ordered = setup();
    let persistedRequest;
    ordered.session.persist = async () => { persistedRequest = structuredClone(ordered.read().metadata.platformGeneration.current); };
    ordered.deps.submit = async body => {
        assert.equal(persistedRequest.requestId, body.requestId);
        return ordered.job(body);
    };
    await submitPlatformNode(ordered.session, ordered.provider, "prompt", [], ordered.deps);
    assert.equal(persistedRequest.jobId, "j");
});

test("partially imported results survive a local save failure and only missing outputs resume", async () => {
    const s = setup();
    await submitPlatformNode(s.session, s.provider, "prompt", [], s.deps);
    const body = s.read().metadata.platformGeneration.current;
    const value = s.job({ ...body, canvasId: "c", nodeId: "n" }, { status: "succeeded", outputs: [{ id: "a", kind: "image" }, { id: "b", kind: "image" }] });
    const save = s.deps.saveOutput;
    s.deps.saveOutput = async output => { if (output.id === "b") throw Error("disk full"); return save(output); };
    await assert.rejects(receivePlatformJob(s.session, value, s.deps), /disk full/);
    assert.equal(s.read().metadata.platformGeneration.current.status, "save_failed");
    assert.equal(s.read().metadata.storageKey, "image:a");
    assert.equal(s.read().metadata.platformGeneration.current.outputs.length, 1);
    s.deps.saveOutput = save;
    await receivePlatformJob(s.session, value, s.deps);
    assert.deepEqual(s.calls, ["submit", "save:a", "save:b"]);
    assert.equal(s.read().metadata.platformGeneration.current.outputs.length, 2);
    await assert.rejects(receivePlatformJob(s.session, { ...value, canvasId: "other" }, s.deps), /画布/);
});
