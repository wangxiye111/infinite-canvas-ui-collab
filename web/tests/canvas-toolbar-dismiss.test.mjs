import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

test("more tools dismiss on outside pointerdown and Escape, but keep popup clicks", () => {
    let cursor = 0;
    const slots = [], effects = [], listeners = new Map();
    const react = {
        useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], (value) => { slots[i] = typeof value === "function" ? value(slots[i]) : value; }]; },
        useRef(initial) { const i = cursor++; return slots[i] ||= { current: initial }; },
        useEffect(effect) { cursor++; effects.push(effect); },
    };
    const jsx = (type, props) => ({ type, props });
    const imports = {
        react, "react/jsx-runtime": { jsx, jsxs: jsx },
        antd: { Dropdown: "Dropdown", Button: "Button" }, "lucide-react": {},
        "@/lib/canvas-theme": { canvasThemes: { light: { toolbar: {} } } },
        "@/lib/canvas/node-registry": { useNodeRegistryVersion() {}, listNodeDefinitions: () => [] },
        "@/stores/use-theme-store": { useThemeStore: (select) => select({ theme: "light" }) },
        "react-i18next": { useTranslation: () => ({ t: (key) => key }) },
    };
    const exports = {};
    const source = readFileSync(new URL("../src/components/canvas/canvas-toolbar.tsx", import.meta.url), "utf8");
    const document = { addEventListener: (type, handler, capture) => listeners.set(type, { handler, capture }), removeEventListener: (type) => listeners.delete(type) };
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, { exports, document, require: (name) => imports[name] || {} });
    const all = (node) => Array.isArray(node) ? node.flatMap(all) : node && typeof node === "object" ? [node, ...all(node.props?.children)] : [];
    let cleanups = [];
    const render = () => {
        cleanups.forEach((cleanup) => cleanup?.());
        cursor = 0;
        const tree = exports.CanvasToolbar({ canvasTool: "select" });
        tree.props.ref.current = { contains: (target) => target === "toolbar" };
        const dropdown = all(tree).find((node) => node.type === "Dropdown");
        const popup = dropdown.props.popupRender?.("menu");
        if (popup) popup.props.ref.current = { contains: (target) => target === "menu" };
        cleanups = effects.splice(0).map((effect) => effect());
        return dropdown;
    };
    let dropdown = render();
    assert.equal(typeof dropdown.props.onOpenChange, "function");
    dropdown.props.onOpenChange(true);
    dropdown = render();
    assert.equal(dropdown.props.open, true);
    assert.equal(listeners.get("pointerdown").capture, true);
    listeners.get("pointerdown").handler({ target: "menu" });
    assert.equal(render().props.open, true);
    listeners.get("pointerdown").handler({ target: "blank-canvas" });
    assert.equal(render().props.open, false);
    render().props.onOpenChange(true);
    render();
    listeners.get("keydown").handler({ key: "Escape" });
    assert.equal(render().props.open, false);
});
