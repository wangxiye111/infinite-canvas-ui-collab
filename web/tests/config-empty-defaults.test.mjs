import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const exports = {};
let persistence;
const imports = {
    react: {},
    zustand: { create: () => (initializer) => initializer(() => {}, () => ({})) },
    "zustand/middleware": { persist: (initializer, options) => { persistence = options; return initializer; } },
    nanoid: { nanoid: () => "new-channel" },
    "@/i18n": { default: { t: (key) => key } },
    "@/services/api/local-cli": { isLocalCliEngine: (value) => value.endsWith("-cli") },
};
const source = readFileSync(new URL("../src/stores/use-config-store.ts", import.meta.url), "utf8");
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports, require: (name) => imports[name] });
const restore = (config) => persistence.merge({ config }, exports.useConfigStore).config;
const seed = { id: "default", name: "默认渠道", baseUrl: "https://api.openai.com", apiKey: "", apiFormat: "openai", models: [
    { name: "gpt-image-2", capability: "image" }, { name: "grok-imagine-video", capability: "video" },
    { name: "gpt-5.5", capability: "text" }, { name: "gpt-4o-mini-tts", capability: "audio" },
] };

test("fresh configuration has no invented models or channels", () => {
    assert.equal(exports.defaultConfig.channels.length, 0);
    assert.equal(exports.defaultConfig.models.length, 0);
    for (const key of ["model", "imageModel", "videoModel", "textModel", "audioModel"]) assert.equal(exports.defaultConfig[key], "");
});

test("rehydrating empty channels never reconstructs a phantom channel", () => {
    assert.equal(restore({ channels: [], videoModel: "default::grok-imagine-video" }).channels.length, 0);
});

test("an untouched seed is removed together with its default selections", () => {
    const restored = restore({ channels: [seed], model: "default::gpt-image-2", imageModel: "default::gpt-image-2", videoModel: "default::grok-imagine-video", textModel: "default::gpt-5.5", audioModel: "default::gpt-4o-mini-tts" });
    assert.equal(restored.channels.length, 0);
    assert.equal(restored.models.length, 0);
    for (const key of ["model", "imageModel", "videoModel", "textModel", "audioModel"]) assert.equal(restored[key], "");
});

test("credentials, custom endpoints, model edits and CLI channels are preserved", () => {
    for (const patch of [{ apiKey: "configured" }, { baseUrl: "https://my-service.example" }, { models: [seed.models[0]] }, { apiFormat: "codex-cli", baseUrl: "" }]) {
        const channel = { ...seed, ...patch };
        const restored = restore({ channels: [channel], imageModel: "default::gpt-image-2" });
        assert.equal(restored.channels.length, 1);
        assert.equal(restored.channels[0].apiFormat, channel.apiFormat);
        assert.equal(restored.channels[0].apiKey, channel.apiKey);
        assert.equal(restored.imageModel, "default::gpt-image-2");
    }
});
