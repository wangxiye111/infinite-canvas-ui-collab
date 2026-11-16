import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { createWorkspaceStorage } from "../src/workspace-storage.mjs";

test("separate clients reopen shared history; stale writes and deleted-record resurrection are refused", async t => {
    const directory = await mkdtemp(join(tmpdir(), "canvas-workspace-"));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const first = createWorkspaceStorage(directory), second = createWorkspaceStorage(directory);
    const original = first.put("canvas_state", "canvas", { revision: null, value: "original" });
    assert.equal(second.get("canvas_state", "canvas").value, "original");
    const changed = second.put("canvas_state", "canvas", { revision: original.revision, value: "updated" });
    assert.throws(() => first.put("canvas_state", "canvas", { revision: original.revision, value: "stale" }), { status: 409 });
    assert.equal(first.get("canvas_state", "canvas").value, "updated");
    second.put("canvas_state", "canvas", { revision: changed.revision, value: null });
    assert.equal(first.list("canvas_state")[0].deleted, true);
    assert.throws(() => first.put("canvas_state", "canvas", { revision: null, value: "old browser" }), { status: 409 });
    assert.throws(() => first.get("../credentials", "x"), { status: 400 });
    const path = join(directory, "workspace", "canvas_state", createHash("sha256").update("canvas").digest("hex") + ".json");
    await writeFile(path, "damaged data");
    assert.throws(() => first.put("canvas_state", "canvas", { revision: null, value: "replace damaged" }));
});
