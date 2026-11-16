import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as setup from "../src/lib/local-cli-image-setup.ts";

const all = (node) => Array.isArray(node) ? node.flatMap(all) : node && typeof node === "object" ? [node, ...all(node.props?.children)] : [];
const button = (tree, text) => all(tree).find((node) => node.type === "Button" && node.props.children === text);
const flush = () => new Promise((resolve) => setImmediate(resolve));
function mount(path, exportName, extra = {}) {
    const provider = { id: "antigravity-cli", state: "configured", config: {}, fields: [], actions: [{ id: "image", output: "image" }], details: { loginState: "unchecked" } };
    const query = { data: [provider], dataUpdatedAt: 1, isFetching: false, setProvider(value) { this.data = [value]; this.dataUpdatedAt++; } };
    const config = { imageModel: "codex::codex-image-default", models: ["codex::codex-image-default"], channels: [{ id: "codex", apiFormat: "codex-cli", models: [{ name: "codex-image-default", capability: "image" }] }] };
    const store = { config, localCliEngine: "codex-cli", openConfigDialog(...args) { calls.push(["openConfig", ...args]); } };
    const useConfigStore = Object.assign((select) => select(store), { getState: () => store, setState: (patch) => Object.assign(store, patch) });
    let cursor = 0;
    const slots = [], effects = [], calls = [];
    const react = {
        useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], (value) => { slots[i] = typeof value === "function" ? value(slots[i]) : value; }]; },
        useRef(initial) { const i = cursor++; return slots[i] ||= { current: initial }; },
        useEffect(effect, deps) { const i = cursor++; const prior = slots[i]; if (!prior || deps.some((value, j) => value !== prior[j])) effects.push(effect); slots[i] = deps; },
    };
    const jsx = (type, props) => ({ type, props });
    const api = {
        check: async (engine) => { calls.push(["check", engine]); return { ...provider, state: "ready", details: { loginState: "authenticated", imageAvailable: true, imageAdapter: "antigravity-acp" } }; },
        login: async (engine) => { calls.push(["login", engine]); return { id: "login-1", provider: engine, status: "running" }; },
        loginStatus: async (id) => { calls.push(["loginStatus", id]); return { id, provider: "antigravity-cli", status: "succeeded" }; },
    };
    const imports = {
        react, "react/jsx-runtime": { jsx, jsxs: jsx },
        antd: { App: { useApp: () => ({ message: { warning() {}, error() {}, success() {} } }) }, Button: "Button", Select: "Select", Form: Object.assign("Form", { Item: "Form.Item" }), theme: { useToken: () => ({ token: {} }) } },
        "lucide-react": {}, nanoid: { nanoid: () => "new-gemini" },
        "react-router-dom": { useNavigate: () => () => {}, useLocation: () => ({ pathname: "/config" }) },
        "@/hooks/use-local-cli-providers": { useLocalCliProviders: () => query },
        "@/lib/local-cli-image-setup": setup,
        "@/services/api/local-cli": { localCliApi: api, localCliNames: { "codex-cli": "Codex CLI", "gemini-cli": "Gemini CLI", "antigravity-cli": "Antigravity CLI" } },
        "@/stores/use-config-store": { useConfigStore, decodeChannelModel: (value) => { const [channelId, model] = value.split("::"); return { channelId, model }; } },
        "@/stores/use-agent-store": {}, "@/stores/use-local-cli-agent-store": {}, "@/components/agent/local-cli-jobs": {}, "@/components/local-cli-image-connection": {}, ...extra,
    };
    const exports = {};
    const source = ts.transpileModule(readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    vm.runInNewContext(source, { exports, require: (name) => imports[name], Error });
    return { query, store, calls, render: (props = {}) => { cursor = 0; const tree = exports[exportName](props); effects.splice(0).forEach((effect) => effect()); return tree; } };
}

test("Gemini setup checks before enabling Add and adding preserves GPT as the default", async () => {
    const ui = mount("components/local-cli-image-connection.tsx", "LocalCliImageConnection");
    const props = { setup: true, engine: "antigravity-cli" };
    let tree = ui.render(props);
    assert.ok(button(tree, "检测连接"), "Gemini setup must expose connection detection");
    assert.ok(button(tree, "添加 Gemini 图片模型").props.disabled);
    await button(tree, "检测连接").props.onClick(); await flush();
    tree = ui.render(props);
    assert.deepEqual(ui.calls, [["check", "antigravity-cli"]]);
    assert.equal(button(tree, "添加 Gemini 图片模型").props.disabled, false);
    button(tree, "添加 Gemini 图片模型").props.onClick();
    assert.equal(ui.store.config.imageModel, "codex::codex-image-default");
    assert.ok(ui.store.config.models.includes("new-gemini::antigravity-image-default"));
});

test("Google login starts on click and is checked only when the user returns", async () => {
    const ui = mount("components/layout/config-local-cli.tsx", "ConfigLocalCli");
    all(ui.render()).find((node) => node.type === "Select").props.onChange("antigravity-cli");
    let tree = ui.render();
    assert.ok(button(tree, "登录 Google"), "Antigravity setup must offer Google login");
    assert.deepEqual(ui.calls, []);
    button(tree, "登录 Google").props.onClick(); await flush();
    assert.deepEqual(ui.calls, [["login", "antigravity-cli"]]);
    tree = ui.render();
    assert.equal(button(tree, "登录 Google").props.disabled, true);
    button(tree, "登录 Google").props.onClick(); await flush();
    assert.deepEqual(ui.calls, [["login", "antigravity-cli"]]);
    button(tree, "检查登录状态").props.onClick(); await flush();
    assert.deepEqual(ui.calls, [["login", "antigravity-cli"], ["loginStatus", "login-1"], ["check", "antigravity-cli"]]);
});

test("Gemini model opens its own connection settings instead of Codex settings", () => {
    const ui = mount("components/local-cli-image-connection.tsx", "LocalCliImageConnection");
    ui.store.config.channels.push({ id: "gemini", apiFormat: "antigravity-cli", models: [{ name: "antigravity-image-default", capability: "image" }] });
    const tree = ui.render({ model: "gemini::antigravity-image-default" });
    button(tree, "连接设置").props.onClick();
    assert.deepEqual(ui.calls, [["openConfig", false, "local-cli", "antigravity-cli"]]);
});

test("a cached authenticated Google account is shown after reopening setup while images remain unavailable", async () => {
    const ui = mount("components/layout/config-local-cli.tsx", "ConfigLocalCli");
    ui.store.localCliEngine = "antigravity-cli";
    ui.query.setProvider({ ...ui.query.data[0], details: { loginState: "authenticated", imageAvailable: false, imageAdapter: "antigravity-acp" } });
    let tree = ui.render();
    const status = all(tree).find((node) => node.props?.role === "status");
    assert.equal(status.props.children, "Google 已登录，请继续第 2 步。");
    assert.equal(button(tree, "登录 Google"), undefined);
    button(tree, "检查登录状态").props.onClick(); await flush();
    assert.deepEqual(ui.calls, [["login", "antigravity-cli"]]);
    tree = ui.render();
    assert.equal(all(tree).filter((node) => node.type === "Button" && node.props.children === "检查登录状态").length, 1);
    button(tree, "检查登录状态").props.onClick(); await flush();
    assert.deepEqual(ui.calls, [["login", "antigravity-cli"], ["loginStatus", "login-1"], ["check", "antigravity-cli"]]);

    const image = mount("components/local-cli-image-connection.tsx", "LocalCliImageConnection");
    image.query.setProvider({ ...image.query.data[0], details: { loginState: "authenticated", imageAvailable: false, imageAdapter: "antigravity-acp" } });
    assert.equal(button(image.render({ setup: true, engine: "antigravity-cli" }), "添加 Gemini 图片模型").props.disabled, true);
});
