import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";
import vm from "node:vm";
const root = new URL("../src/", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

test("channel editor directs native image setup to local CLI settings", () => {
    const source = read("components/layout/channel-editor-drawer.tsx");
    assert.doesNotMatch(source, /gpt-image-2-skill|gpt-5\.4/);
    assert.match(source, /使用本机 CLI 登录/);
    assert.match(source, /「本地 CLI」/);
    assert.match(source, /GPT 生图可在该页一键配置/);
});

test("image alias identifies the local Codex connection", () => {
    const source = read("stores/use-config-store.ts");
    assert.match(source, /GPT 生图（本机 Codex）/);
    assert.doesNotMatch(source, /GPT 生图 · Codex 默认/);
});

test("one shared connection entry is present in setup, image workbench and canvas node", () => {
    assert.ok(existsSync(new URL("components/local-cli-image-connection.tsx", root)));
    for (const path of ["components/layout/config-local-cli.tsx", "pages/image/index.tsx", "components/canvas/canvas-node-prompt-panel.tsx"]) assert.match(read(path), /<LocalCliImageConnection/);
});

test("explicit setup checks locally without login or generation, then applies a single config update", () => {
    const source = read("components/local-cli-image-connection.tsx");
    assert.match(source, /检测并配置 GPT 生图/);
    assert.match(source, /localCliApi\.check\("codex-cli"\)/);
    assert.match(source, /configureCodexImage/);
    assert.match(source, /useConfigStore\.setState\(\{ config: next \}\)/);
    assert.doesNotMatch(source, /runLocalCli|\.login\(|bootstrapCodex/);
    assert.match(source, /pending\.current/);
    assert.match(source, /最多 5 张参考图/);
});

test("canvas uses a compact connection entry above the prompt without adding a footer block", () => {
    const panel = read("components/canvas/canvas-node-prompt-panel.tsx");
    assert.match(panel, /<LocalCliImageConnection\s+compact\b/);
    assert.ok(panel.indexOf("<LocalCliImageConnection") < panel.indexOf("<CanvasPromptChipInput"));
    assert.match(panel, /absolute right-0 top-0/);
    const connection = read("components/local-cli-image-connection.tsx");
    assert.match(connection, /if \(compact\)/);
    assert.match(connection, /aria-label="连接设置"/);
});

test("long mobile model labels shrink inside the workbench card while the adjust action stays visible", () => {
    const page = read("pages/image/index.tsx");
    assert.match(page, /<section className="[^"]*\bmin-w-0\b/);
    assert.match(page, /className="thin-scrollbar flex [^"]*\bmin-w-0\b/);
    assert.match(page, /<span className="min-w-0 flex-1 truncate[^\"]*">\s*\{modelOptionLabel\(effectiveConfig, model\)\}/);
    assert.match(page, /<Button className="shrink-0"[^\n]*\n\s*\{t\("workbench.adjust"\)\}/);
});

test("another setup entry's successful check clears an old offline error even with a shared provider object", async () => {
    const provider = { id: "codex-cli", state: "ready" };
    const query = { data: [provider], dataUpdatedAt: 1, isFetching: false, error: null, setProvider() {} };
    const config = { imageModel: "cli::codex-image-default", channels: [{ id: "cli", apiFormat: "codex-cli", models: [{ name: "codex-image-default", capability: "image" }] }] };
    const store = { config, openConfigDialog() {} };
    let cursor = 0;
    const slots = [], effects = [];
    const react = {
        useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = initial; return [slots[index], (value) => { slots[index] = value; }]; },
        useRef(initial) { const index = cursor++; return slots[index] ||= { current: initial }; },
        useEffect(effect, deps) { const index = cursor++; const prior = slots[index]; if (!prior || deps.some((value, i) => value !== prior[i])) effects.push(effect); slots[index] = deps; },
    };
    const jsx = (type, props) => ({ type, props });
    const imports = {
        react,
        "react/jsx-runtime": { jsx, jsxs: jsx },
        antd: { App: { useApp: () => ({ message: { warning() {}, success() {} } }) }, Button: "Button", theme: { useToken: () => ({ token: {} }) } },
        "lucide-react": {}, nanoid: { nanoid: () => "id" },
        "react-router-dom": { useNavigate: () => () => {} },
        "@/hooks/use-local-cli-providers": { useLocalCliProviders: () => query },
        "@/lib/local-cli-image-setup": { LOCAL_CODEX_IMAGE_MODEL: "codex-image-default", codexImageConnection: (_provider, error) => ({ title: error ? "本地服务不可用" : "已登录", message: "" }) },
        "@/services/api/local-cli": { localCliApi: { check: async () => { throw new Error("offline"); } } },
        "@/stores/use-config-store": { useConfigStore: (select) => select(store), decodeChannelModel: (value) => { const [channelId, model] = value.split("::"); return { channelId, model }; } },
    };
    const exports = {};
    const source = ts.transpileModule(read("components/local-cli-image-connection.tsx"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    vm.runInNewContext(source, { exports, require: (name) => imports[name], Error });
    const render = () => { cursor = 0; const tree = exports.LocalCliImageConnection({}); effects.splice(0).forEach((effect) => effect()); return tree; };
    const all = (node) => Array.isArray(node) ? node.flatMap(all) : node && typeof node === "object" ? [node, ...all(node.props?.children)] : [];
    const text = (tree) => JSON.stringify(tree);
    const first = render();
    all(first).find((node) => node.type === "Button" && node.props["aria-label"] === "检测并配置 GPT 生图（本机 Codex）").props.onClick();
    await new Promise((resolve) => setImmediate(resolve));
    assert.match(text(render()), /本地服务不可用/);
    // React Query may retain the same data/provider references after an identical successful response.
    query.dataUpdatedAt = 2;
    render();
    assert.doesNotMatch(text(render()), /本地服务不可用/);
});
