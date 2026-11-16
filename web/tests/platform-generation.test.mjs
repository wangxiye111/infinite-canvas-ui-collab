import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) }, moduleCache: false });
const { platformPresetKind, validatePlatformInputs, beginPlatformBatch, appendPlatformResult, platformResultMetadata, archivePlatformBatch, platformRoundActions, selectCanvasGenerator, platformNeedsRecovery } = await jiti.import("../src/lib/canvas/platform-generation.ts");
const preset = { id: "p", name: "可灵视频", provider: "kling", action: "image_to_video", model: "actual-model", params: { options: { duration: "5" } } };
const node = () => ({ id: "n", type: "video", position: { x: 0, y: 0 }, width: 400, height: 250, title: "视频", metadata: { content: "blob:old", storageKey: "video:old", mimeType: "video/mp4", platformGeneration: { enabled: true, preset } } });
const result = (id) => ({ id, kind: "video", content: `blob:${id}`, storageKey: `video:${id}`, mimeType: "video/mp4", bytes: 8, naturalWidth: 640, naturalHeight: 360 });

test("only supported image/video presets enter ordinary nodes", () => {
    assert.equal(platformPresetKind(preset), "video");
    assert.equal(platformPresetKind({ ...preset, provider: "jimeng", action: "text2image" }), "image");
    assert.equal(platformPresetKind({ ...preset, provider: "jimeng", action: "frames2video" }), "video");
    assert.equal(platformPresetKind({ ...preset, provider: "runninghub", action: "workflow", params: { outputKind: "video" } }), "video");
    assert.equal(platformPresetKind({ ...preset, provider: "runninghub", action: "workflow", params: { outputKind: "model3d" } }), null);
    assert.equal(platformPresetKind({ ...preset, provider: "liblib" }), null);
});

test("references are validated before upload, including first/last-frame roles", () => {
    const image = { kind: "image", role: "image" };
    assert.doesNotThrow(() => validatePlatformInputs(preset, [image, { ...image, role: "tailImage" }]));
    assert.throws(() => validatePlatformInputs(preset, [{ ...image, role: "tailImage" }]), /首帧/);
    assert.throws(() => validatePlatformInputs(preset, [image, image]), /一张|重复/);
    assert.throws(() => validatePlatformInputs({ ...preset, action: "text_to_video" }, [image]), /文生/);
    assert.throws(() => validatePlatformInputs({ ...preset, provider: "jimeng", action: "image2video" }, [image, image]), /一张/);
    assert.throws(() => validatePlatformInputs(preset, [{ kind: "video", role: "image" }]), /图片/);
    const rh = { ...preset, provider: "runninghub", action: "workflow", params: { inputTargets: [{ role: "face", nodeId: "1", fieldName: "image" }] } };
    assert.throws(() => validatePlatformInputs(rh, []), /face/);
    assert.doesNotThrow(() => validatePlatformInputs(rh, [{ kind: "image", role: "face" }]));
});

test("submission snapshots preserve original output and never mutate the saved preset", () => {
    const source = node();
    const refs = [{ nodeId: "img", kind: "image", role: "image", storageKey: "image:one", content: "blob:one", name: "参考图" }];
    const state = beginPlatformBatch(source, preset, "prompt", refs, "r");
    assert.equal(source.metadata.platformGeneration.current, undefined);
    assert.equal(state.history[0].outputs[0].storageKey, "video:old");
    state.current.preset.params.options.duration = "10";
    state.current.references[0].storageKey = "image:changed";
    assert.equal(preset.params.options.duration, "5");
    assert.equal(refs[0].storageKey, "image:one");
    assert.throws(() => beginPlatformBatch({ ...source, metadata: { ...source.metadata, platformGeneration: state } }, preset, "again", refs, "r2"), /已有/);
});

test("results update original node, retain candidates, deduplicate and reject stale requests", () => {
    let current = node();
    current.metadata.content = undefined;
    current.metadata.storageKey = undefined;
    current.metadata.platformGeneration = beginPlatformBatch(current, preset, "prompt", [], "r");
    current.metadata = { ...current.metadata, ...appendPlatformResult(current, "r", result("a")) };
    assert.equal(current.metadata.storageKey, "video:a");
    current.metadata = { ...current.metadata, ...appendPlatformResult(current, "r", result("b")) };
    assert.equal(current.metadata.storageKey, "video:a");
    assert.equal(current.metadata.platformGeneration.current.outputs.length, 2);
    const duplicate = appendPlatformResult(current, "r", result("a"));
    assert.equal(duplicate.platformGeneration.current.outputs.length, 2);
    assert.throws(() => appendPlatformResult(current, "other", result("c")), /请求/);
    const selection = platformResultMetadata("video", current.metadata.platformGeneration.current.outputs, "b");
    assert.equal(selection.storageKey, "video:b");
    assert.equal(selection.videoTaskId, undefined);
});

test("new candidates never replace an already selected output", () => {
    const current = node();
    current.metadata.platformGeneration = beginPlatformBatch(current, preset, "new prompt", [], "r");
    const patch = appendPlatformResult(current, "r", result("new"));
    assert.equal(patch.content, undefined);
    assert.equal(patch.storageKey, undefined);
    assert.equal(patch.platformGeneration.current.outputs.length, 1);
    assert.equal(patch.platformGeneration.history[0].outputs[0].storageKey, "video:old");
});

test("starting a new round archives the previous batch and preserves its snapshot", () => {
    const source = node();
    const state = beginPlatformBatch(source, preset, "original prompt", [], "r");
    state.current.outputs.push(result("a"));
    state.current.jobId = "j";
    const next = archivePlatformBatch(state);
    assert.equal(next.current, undefined);
    assert.equal(next.history.at(-1).jobId, "j");
    assert.equal(next.history.at(-1).prompt, "original prompt");
    assert.equal(state.current.jobId, "j");
});

test("a failed query makes the manual confirmation reachable without allowing automatic resubmission", () => {
    const active = { jobId: "j", status: "running" };
    assert.equal(platformRoundActions(active, false, false).canStart, false);
    assert.deepEqual(platformRoundActions(active, false, true), { canStart: true, needsConfirmation: true });
    assert.equal(platformRoundActions(active, true, true).canStart, false);
    assert.deepEqual(platformRoundActions({ status: "succeeded" }, false, false), { canStart: true, needsConfirmation: false });
    assert.deepEqual(platformRoundActions({ status: "submitting" }, false, true), { canStart: true, needsConfirmation: true });
});

test("unified generator selection keeps completed task history and snapshots its new preset", () => {
    const source = node();
    source.metadata.platformGeneration = beginPlatformBatch(source, preset, "old prompt", [], "r");
    source.metadata.platformGeneration.current.status = "succeeded";
    source.metadata.platformGeneration.current.outputs = [result("one")];
    const selected = selectCanvasGenerator(source, { preset: { ...preset, id: "next" } });
    assert.equal(selected.platformGeneration.current, undefined);
    assert.equal(selected.platformGeneration.history.at(-1).requestId, "r");
    assert.equal(selected.platformGeneration.preset.id, "next");
    assert.equal(selected.platformGeneration.enabled, true);
    selected.platformGeneration.preset.params.options.duration = "9";
    assert.equal(preset.params.options.duration, "5");
    const personal = selectCanvasGenerator(source, { model: "personal-image-model" });
    assert.equal(personal.model, "personal-image-model");
    assert.equal(personal.platformGeneration.enabled, false);
    assert.equal(personal.platformGeneration.history.at(-1).outputs[0].id, "one");
});

test("unresolved tasks cannot be replaced by selecting another generator", () => {
    for (const status of ["submitting", "running", "query_failed", "save_failed", "interrupted"]) {
        const source = node();
        source.metadata.platformGeneration = beginPlatformBatch(source, preset, "old prompt", [], "r");
        source.metadata.platformGeneration.current.status = status;
        assert.equal(platformNeedsRecovery(source.metadata.platformGeneration.current), true);
        assert.throws(() => selectCanvasGenerator(source, { model: "another" }), /原任务/);
    }
    assert.equal(platformNeedsRecovery({ status: "succeeded" }), false);
});
