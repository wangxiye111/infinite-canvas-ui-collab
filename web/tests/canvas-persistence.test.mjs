import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import localforage from "localforage";
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
globalThis.window = { localStorage: globalThis.localStorage };
const jiti = createJiti(import.meta.url, { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) } });
localforage.getItem = async () => null;
const { useCanvasStore, saveCanvasNodeNow } = await jiti.import("../src/stores/canvas/use-canvas-store.ts");

test("generation persistence waits for the storage acknowledgement and includes the request snapshot", async () => {
    let release;
    let saved;
    let acknowledgeStarted;
    const started = new Promise(resolve => { acknowledgeStarted = resolve; });
    localforage.setItem = async (_key, value) => {
        saved = JSON.parse(value);
        acknowledgeStarted();
        await new Promise(resolve => { release = resolve; });
    };
    const id = useCanvasStore.getState().createProject("persistence test");
    const node = { id: "n", type: "image", metadata: { platformGeneration: { current: { requestId: "paid-intent", outputs: [] } } } };
    let finished = false;
    const saving = saveCanvasNodeNow(id, node).then(() => { finished = true; });
    await started;
    assert.equal(finished, false);
    assert.equal(saved.state.projects.find(project => project.id === id).nodes[0].metadata.platformGeneration.current.requestId, "paid-intent");
    release();
    await saving;
    assert.equal(finished, true);
});

test("immediate persistence propagates a storage failure instead of reporting success", async () => {
    localforage.setItem = async () => { throw Error("local storage full"); };
    globalThis.localStorage.setItem = () => { throw Error("local storage full"); };
    const id = useCanvasStore.getState().projects[0].id;
    await assert.rejects(saveCanvasNodeNow(id, { id: "n", type: "image", metadata: {} }), /local storage full/);
});
