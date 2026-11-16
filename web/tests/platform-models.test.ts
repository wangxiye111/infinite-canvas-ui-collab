import assert from "node:assert/strict";
import { test } from "node:test";
import { connectedPlatformPresets, platformModel } from "../src/lib/connectors/platform-models.ts";

test("connected platform models become selectable presets without invented input support", () => {
    const provider = { id: "kling", state: "ready", actions: [{ id: "image_to_video", label: "图生视频" }], details: { models: { image_to_video: [
        { model: "frames", inputs: [{ name: "first_image" }], arguments: [{ name: "duration", default: "5", allowedValues: ["5", "10"] }] },
        { model: "omni", inputs: [{ name: "image_1" }], arguments: [] },
    ] } } } as any;
    const presets = connectedPlatformPresets([provider]);
    assert.equal(presets.length, 1);
    assert.equal(presets[0].model, "frames");
    assert.deepEqual(presets[0].params, { options: { duration: "5" } });
    assert.equal(platformModel(provider, presets[0])?.model, "frames");
    assert.equal(connectedPlatformPresets([{ ...provider, state: "error" }]).length, 0);
    (presets[0].params!.options as any).duration = "10";
    assert.equal(provider.details.models.image_to_video[0].arguments[0].default, "5");
});
