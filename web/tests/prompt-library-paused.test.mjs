import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
import vm from 'node:vm';
const root = new URL('../src/', import.meta.url);
const read = (file) => readFileSync(new URL(file, root), 'utf8');
function evaluate(file, imports = {}) {
    const exports = {};
    vm.runInNewContext(ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, { exports, require: (name) => imports[name] ?? {} });
    return exports;
}
test('prompt library has a single disabled release flag', () => {
    assert.ok(existsSync(new URL('constant/feature-flags.ts', root)), 'missing release flag');
    assert.equal(evaluate('constant/feature-flags.ts').PROMPT_LIBRARY_ENABLED, false);
});
test('navigation hides prompts while preserving the canvas entry', () => {
    const { navigationTools } = evaluate('constant/navigation-tools.ts', { '@/constant/feature-flags': { PROMPT_LIBRARY_ENABLED: false } });
    assert.equal(navigationTools.some((item) => item.slug === 'prompts'), false);
    assert.equal(navigationTools[0].slug, 'canvas');
});
for (const file of ['router.tsx', 'pages/home/index.tsx', 'pages/image/index.tsx', 'pages/video/index.tsx', 'components/canvas/canvas-side-panel.tsx', 'components/canvas/canvas-prompt-library.tsx', 'components/layout/app-config-modal.tsx', 'hooks/use-prompt-source-scheduler.ts', 'components/prompts/use-prompt-list.ts']) {
    test(`${file} respects the shared prompt-library gate`, () => assert.match(read(file), /PROMPT_LIBRARY_ENABLED/));
}
test('paused sources do not read cache, refresh sources, or query source configuration', async () => {
    let touched = 0;
    const touch = () => { touched++; return []; };
    const api = evaluate('services/api/prompts.ts', {
        '@/constant/feature-flags': { PROMPT_LIBRARY_ENABLED: false },
        localforage: { default: { createInstance: () => ({ getItem: touch, setItem: touch }) } },
        './prompt-source-runtime': { runPromptSource: touch },
        '@/stores/use-prompt-source-store': { usePromptSourceStore: { getState: () => { touched++; return { sources: [] }; } } },
        '@/i18n': { default: { t: (key) => key } },
    });
    assert.equal((await api.fetchPrompts()).total, 0);
    assert.equal((await api.fetchSourcePrompts('saved-source')).length, 0);
    assert.equal((await api.refreshAllSources()).results.length, 0);
    assert.equal((await api.refreshDueSources(60000)).results.length, 0);
    assert.equal(Object.keys(await api.fetchPromptSourceStatuses()).length, 0);
    await assert.rejects(api.refreshSource('saved-source'), /提示词库已暂停/);
    assert.equal(touched, 0);
});
test('paused scheduler does not create a timer or trigger refresh', () => {
    const effects = [];
    const hook = evaluate('hooks/use-prompt-source-scheduler.ts', {
        '@/constant/feature-flags': { PROMPT_LIBRARY_ENABLED: false },
        react: { useEffect: (effect) => effects.push(effect) },
        '@tanstack/react-query': { useQueryClient: () => ({}) },
        '@/stores/use-prompt-source-store': { usePromptSourceStore: (select) => select({ schedule: { intervalMinutes: 1 } }) },
    });
    hook.usePromptSourceScheduler();
    assert.equal(effects[0](), undefined);
});
test('paused prompt list explicitly disables background query', () => {
    let options;
    const hook = evaluate('components/prompts/use-prompt-list.ts', {
        '@/constant/feature-flags': { PROMPT_LIBRARY_ENABLED: false },
        react: { useState: (v) => [v, () => {}], useEffect: () => {}, useMemo: (fn) => fn() },
        '@tanstack/react-query': { useInfiniteQuery: (value) => { options = value; return {}; } },
    });
    hook.usePromptList({ keyword: '', tags: [], category: 'all', enabled: true });
    assert.equal(options.enabled, false);
});
