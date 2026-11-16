import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";
import vm from "node:vm";

test("modal tabs follow the shared requested tab even when hidden children never render", () => {
    let cursor = 0, writes = 0;
    const slots = [], effects = [];
    const react = {
        useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial; return [slots[index], (value) => { slots[index] = value; }]; },
        useRef(initial) { const index = cursor++; return slots[index] ||= { current: initial }; },
        useEffect(effect, deps) { const index = cursor++; const previous = slots[index]; if (!previous || deps.some((value, i) => value !== previous[i])) effects.push(effect); slots[index] = deps; },
    };
    const jsx = (type, props) => ({ type, props });
    const config = { channels: [], size: "auto", apiKey: "preserved", textModel: "keep-text" };
    const state = { config, configTab: "local-cli", webdav: { url: "", lastSyncedAt: "" }, updateConfig() { writes++; }, updateWebdavConfig() { writes++; } };
    const useConfigStore = Object.assign((select) => select(state), { setState: (patch) => Object.assign(state, patch) });
    const imports = {
        react, "react/jsx-runtime": { jsx, jsxs: jsx },
        antd: { App: { useApp: () => ({ message: {} }) }, Form: { Item: "FormItem" }, Input: { Password: "Password", TextArea: "TextArea" }, Radio: { Group: "RadioGroup" }, Tabs: "Tabs" },
        "react-i18next": { useTranslation: () => ({ t: (key) => key, i18n: { resolvedLanguage: "zh-CN" } }) },
        "@/stores/use-config-store": { useConfigStore },
        "@/lib/media-size": { mediaScaleOptions: [], inferMediaScale: () => "auto", parseVideoResolution: () => "720" },
    };
    const exports = {};
    const source = readFileSync(new URL("../src/components/layout/app-config-modal.tsx", import.meta.url), "utf8");
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, { exports, require: (name) => imports[name] || {} });
    const all = (node) => Array.isArray(node) ? node.flatMap(all) : node && typeof node === "object" ? [node, ...all(node.props?.children)] : [];
    const render = () => { cursor = 0; const tree = exports.AppConfigPanel({ showDoneButton: true }); effects.splice(0).forEach((effect) => effect()); return all(tree).find((node) => node.type === "Tabs"); };
    assert.equal(render().props.activeKey, "local-cli");
    render().props.onChange("channels");
    assert.equal(state.configTab, "channels");
    assert.equal(render().props.activeKey, "channels");
    // Ant Design may freeze the panel while hidden. A new open request changes only the store.
    useConfigStore.setState({ configTab: "local-cli" });
    assert.equal(render().props.activeKey, "local-cli");
    render().props.onChange("local-storage");
    assert.equal(state.configTab, "local-storage");
    assert.equal(render().props.items.find((item) => item.key === "local-storage").children.props.active, true);
    assert.equal(writes, 0);
    assert.equal(state.config, config);
});
