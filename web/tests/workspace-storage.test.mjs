import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import localforage from "localforage";

test("browser data is copied once, retained locally, and stale writes cannot overwrite shared history", async () => {
    globalThis.location = { hostname: "127.0.0.1" };
    const records = new Map();
    const localRecords = new Map([["canvas", "original browser project"]]);
    const local = { keys: async () => [...localRecords.keys()], getItem: async key => localRecords.get(key) ?? null };
    localforage.getSerializer = async () => ({ serialize: (value, callback) => callback(JSON.stringify(value)), deserialize: JSON.parse });
    let revision = 0;
    globalThis.fetch = async (url, init) => {
        const key = decodeURIComponent(url.split("/").pop());
        if (init) {
            const data = JSON.parse(init.body);
            if ((records.get(key)?.revision ?? null) !== data.revision) return Response.json({ error: "保存冲突" }, { status: 409 });
            records.set(key, { key, value: data.value, revision: String(++revision) });
            return Response.json({ revision: String(revision) });
        }
        if (key === "canvas_state") return Response.json({ entries: [...records.values()].map(({ key, revision, value }) => ({ key, revision, deleted: value === null })) });
        return Response.json({ record: records.get(key) ?? null });
    };
    const jiti = createJiti(import.meta.url, { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) } });
    const { workspaceStore } = await jiti.import("../src/services/api/workspace-storage.ts");
    const store = workspaceStore("canvas_state", local, "canvas");
    assert.equal(await store.getItem("canvas"), "original browser project");
    await store.setItem("canvas", "saved locally on server");
    assert.equal(localRecords.get("canvas"), "original browser project");
    records.set("canvas", { key: "canvas", revision: "other-browser", value: JSON.stringify("another browser changed this") });
    await assert.rejects(store.setItem("canvas", "stale browser overwrite"), /保存冲突/);
    assert.equal(JSON.parse(records.get("canvas").value), "another browser changed this");
    assert.equal(await store.getItem("canvas"), "another browser changed this");
    await store.removeItem("canvas");
    assert.equal(await store.getItem("canvas"), null);
    assert.equal(localRecords.get("canvas"), "original browser project");
});
