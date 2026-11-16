import assert from "node:assert/strict";
import { test } from "node:test";
import type { AiConfig } from "../src/stores/use-config-store.ts";
import type { LocalCliProvider } from "../src/services/api/local-cli.ts";
import * as setup from "../src/lib/local-cli-image-setup.ts";
import { redact } from "../../canvas-connectors/src/store.mjs";

const provider = (patch: Partial<LocalCliProvider> = {}): LocalCliProvider => ({
    id: "codex-cli", name: "Codex CLI", state: "ready", message: "已登录", billing: "额度未知", docs: "", config: {}, fields: [],
    actions: [{ id: "image", label: "生图", output: "image" }],
    details: { loginState: "authenticated", imageAvailable: true, imageAdapter: "codex-native", quota: "unknown", imageDriverState: "available", imageDriverModel: "official-image-driver", imageDriverReasoning: "medium", imageDriverSource: "official-model-list" }, ...patch,
});
const config = (): AiConfig => ({
    imageModel: "remote::image", model: "remote::image", textModel: "remote::text", videoModel: "remote::video", audioModel: "remote::audio",
    apiKey: "keep-key", baseUrl: "https://existing.example", models: ["remote::image"],
    channels: [{ id: "remote", name: "原渠道", apiFormat: "openai", apiKey: "keep-key", baseUrl: "https://existing.example", models: [{ name: "image", capability: "image" }] }],
} as AiConfig);

test("configure GPT image explicitly selects the image default and preserves all other settings", () => {
    assert.equal(typeof setup.configureCodexImage, "function");
    const before = config();
    const result = setup.configureCodexImage(before, provider(), "new-cli");
    assert.equal(result.imageModel, `new-cli::${setup.LOCAL_CODEX_IMAGE_MODEL}`);
    assert.equal(result.model, before.model);
    assert.equal(result.channels[0], before.channels[0]);
    for (const key of ["textModel", "videoModel", "audioModel", "apiKey", "baseUrl"] as const) assert.equal(result[key], before[key]);
    assert.deepEqual(result.channels[1].models, [{ name: setup.LOCAL_CODEX_IMAGE_MODEL, capability: "image" }]);
    assert.ok(result.models.includes(result.imageModel));
});

test("repeat setup reuses an existing CLI channel and keeps its text models, scripts, and fields", () => {
    const before = config();
    const cli = { id: "cli", name: "我的 Codex", apiFormat: "codex-cli" as const, baseUrl: "preserved", apiKey: "preserved", models: [{ name: "default", capability: "text" as const, script: "keep" }] };
    before.channels.push(cli);
    const once = setup.configureCodexImage(before, provider(), "unused");
    const twice = setup.configureCodexImage(once, provider(), "unused-again");
    assert.deepEqual(twice, once);
    assert.equal(twice.channels.length, 2);
    assert.equal(twice.channels[1].models[0], cli.models[0]);
    assert.equal(twice.channels[1].apiKey, "preserved");
    assert.equal(twice.channels[1].baseUrl, "preserved");
    assert.equal(twice.imageModel, `cli::${setup.LOCAL_CODEX_IMAGE_MODEL}`);
});

test("a conflicting user model is preserved instead of overwritten", () => {
    const before = config();
    before.channels.push({ id: "cli", name: "原 Codex", apiFormat: "codex-cli", baseUrl: "", apiKey: "", models: [{ name: setup.LOCAL_CODEX_IMAGE_MODEL, capability: "text" }] });
    const result = setup.configureCodexImage(before, provider(), "new-cli");
    assert.equal(result.channels[1], before.channels[1]);
    assert.equal(result.imageModel, `new-cli::${setup.LOCAL_CODEX_IMAGE_MODEL}`);
});

test("a ready label alone never authorizes image setup", () => {
    const before = config();
    for (const details of [undefined, { imageAvailable: true }, { loginState: "unchecked", imageAvailable: true }, { loginState: "authenticated", imageAvailable: false }]) {
        assert.throws(() => setup.configureCodexImage(before, provider({ details }), "unused"));
        assert.equal(before.channels.length, 1);
    }
});

test("connection messages distinguish service, installation, login, and image setup", () => {
    assert.equal(setup.codexImageConnection(undefined, "offline").code, "service-unavailable");
    assert.equal(setup.codexImageConnection(undefined).code, "unchecked");
    assert.equal(setup.codexImageConnection(provider({ state: "not-installed" })).code, "not-installed");
    assert.equal(setup.codexImageConnection(provider({ details: { loginState: "not-authenticated" } })).code, "not-authenticated");
    assert.equal(setup.codexImageConnection(provider({ details: { loginState: "unchecked" } })).code, "unchecked");
    assert.equal(setup.codexImageConnection(provider({ details: { loginState: "authenticated", imageAvailable: false } })).code, "image-unavailable");
    const ready = setup.codexImageConnection(provider());
    assert.equal(ready.code, "available");
    assert.equal(ready.title, "Codex 已连接");
    assert.equal(ready.message, "可设为生图默认。");
});

test("image setup requires a complete available driver from the official model directory", () => {
    const checked = provider();
    for (const patch of [
        { imageDriverState: undefined }, { imageDriverState: "unchecked" }, { imageDriverState: "unavailable", imageAvailable: false },
        { imageDriverModel: undefined }, { imageDriverModel: " " }, { imageDriverReasoning: undefined }, { imageDriverReasoning: " " },
        { imageDriverSource: undefined }, { imageDriverSource: "local-config" },
    ]) {
        const incomplete = { ...checked, details: { ...checked.details, ...patch } } as LocalCliProvider;
        const connection = setup.codexImageConnection(incomplete);
        assert.notEqual(connection.code, "available");
        assert.match(connection.message, /重新检测/);
        assert.throws(() => setup.configureCodexImage(config(), incomplete, "unused"));
    }
});

test("detecting an official default driver preserves explicit channel image models", () => {
    const before = config();
    const explicit = { name: "my-explicit-driver", capability: "image" as const };
    before.channels.push({ id: "cli", name: "我的 Codex", apiFormat: "codex-cli", baseUrl: "", apiKey: "", models: [explicit] });
    const next = setup.configureCodexImage(before, provider(), "unused");
    assert.equal(next.channels[1].models[0], explicit);
    assert.equal(next.channels[1].models[0].name, "my-explicit-driver");
});

test("API-key authentication never enables the first-phase ChatGPT image setup", () => {
    const apiKey = provider({ details: { loginState: "authenticated", authMethod: "api-key", imageAvailable: true, imageAdapter: "codex-native" } });
    assert.equal(setup.codexImageConnection(apiKey).code, "api-key");
    assert.throws(() => setup.configureCodexImage(config(), apiKey, "unused"), /API Key/);
});

test("public provider contract keeps loginState through the real secret redactor", () => {
    const checked = provider();
    const publicProvider = redact({ ...checked, details: { ...checked.details, authorization: "Bearer test-secret" } }) as LocalCliProvider;
    assert.equal(publicProvider.details?.authorization, "[已隐藏]");
    assert.equal(publicProvider.details?.loginState, "authenticated");
    assert.equal(setup.codexImageConnection(publicProvider).code, "available");
    assert.equal(setup.configureCodexImage(config(), publicProvider, "cli").imageModel, `cli::${setup.LOCAL_CODEX_IMAGE_MODEL}`);
    // A redacted legacy field alone must never be interpreted as a verified login.
    assert.equal(setup.codexImageConnection({ ...publicProvider, details: { ...publicProvider.details, loginState: undefined } }).code, "unchecked");
});

const antigravity = (patch: Partial<LocalCliProvider> = {}) => provider({ id: "antigravity-cli", details: { loginState: "authenticated", imageAvailable: true, imageAdapter: "antigravity-acp" }, ...patch });

test("adding Gemini image preserves the existing GPT default and keeps both selectable", () => {
    assert.equal(typeof setup.configureAntigravityImage, "function");
    const before = setup.configureCodexImage(config(), provider(), "codex");
    const next = setup.configureAntigravityImage(before, antigravity(), "gemini");
    assert.equal(next.imageModel, "codex::codex-image-default");
    assert.equal(next.model, before.model);
    assert.equal(next.channels[1], before.channels[1]);
    assert.deepEqual(next.channels[2].models, [{ name: "antigravity-image-default", capability: "image" }]);
    assert.ok(next.models.includes("gemini::antigravity-image-default"));
    assert.deepEqual(setup.configureAntigravityImage(next, antigravity(), "unused"), next);
});

test("Gemini image setup requires authenticated ready ACP image capability", () => {
    assert.equal(typeof setup.antigravityImageConnection, "function");
    assert.equal(setup.antigravityImageConnection(antigravity()).code, "available");
    for (const checked of [
        antigravity({ state: "configured" }),
        antigravity({ details: undefined }),
        antigravity({ details: { loginState: "not-authenticated" } }),
        antigravity({ details: { loginState: "unchecked", imageAvailable: true, imageAdapter: "antigravity-acp" } }),
        antigravity({ details: { loginState: "authenticated", imageAvailable: false, imageAdapter: "antigravity-acp" } }),
        antigravity({ details: { loginState: "authenticated", imageAvailable: true, imageAdapter: "codex-native" } }),
        antigravity({ actions: [{ id: "text", label: "对话", output: "text" }] }),
    ]) {
        assert.notEqual(setup.antigravityImageConnection(checked).code, "available");
        assert.throws(() => setup.configureAntigravityImage(config(), checked, "unused"));
    }
});
