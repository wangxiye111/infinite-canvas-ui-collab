// Creates an importable, synthetic project for UI acceptance. It never submits a task.
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { zipSync, strToU8 } from "fflate";

const outputs = ["blue", "gold"].map((color, index) => ({ id: color, kind: "image", content: "", storageKey: `image:platform-preview-${color}`, mimeType: "image/svg+xml", bytes: 0, naturalWidth: 640, naturalHeight: 360 }));
const preset = { id: "ui-preview-only", provider: "kling", action: "text_to_image", name: "界面验收样例（非真实任务）", model: "ui-preview-only" };
const project = {
    title: "候选与恢复验收（合成样例，无真实任务）",
    nodes: [{ id: "preview-image", type: "image", title: "合成候选 · 不调用模型", position: { x: 500, y: 120 }, width: 440, height: 248, metadata: {
        content: "preview", storageKey: outputs[0].storageKey, mimeType: "image/svg+xml", naturalWidth: 640, naturalHeight: 360,
        platformGeneration: { enabled: true, preset, current: { requestId: "ui-preview-no-submission", jobId: "ui-preview-no-remote-task", preset, prompt: "只验证任务不存在时可以经确认开始新一轮", status: "running", references: [], outputs: [] }, history: [{ requestId: "ui-preview-history", prompt: "蓝色与金色合成样例", preset, references: [], outputs }] },
    } }], connections: [], viewport: { x: 0, y: 0, k: 1 },
};
const files = {};
const entries = outputs.map((output, index) => {
    const path = `${output.id}.svg`;
    files[path] = strToU8(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="${index ? "#c8922b" : "#306dbb"}"/><text x="320" y="190" text-anchor="middle" font-size="40" fill="white">UI TEST ${index + 1}</text></svg>`);
    return { storageKey: output.storageKey, path, mimeType: output.mimeType, bytes: files[path].length };
});
files["projects.json"] = strToU8(JSON.stringify({ projects: [{ project, files: entries }] }));
const destination = join(tmpdir(), "canvas-platform-preview.zip");
await writeFile(destination, zipSync(files));
console.log(destination);
