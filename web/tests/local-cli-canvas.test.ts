import { describe, expect, test } from "bun:test";

import type { CanvasAgentSnapshot } from "@/lib/canvas/canvas-agent-ops";
import { CanvasNodeType } from "@/types/canvas";
import { cliCanvasSnapshot, parseCliCanvasReply, prepareCliCanvasOps, validateCliCanvasOps } from "../src/components/agent/local-cli-canvas";

const snapshot: CanvasAgentSnapshot = {
    projectId: "canvas-a", title: "画布", selectedNodeIds: [], connections: [], viewport: { x: 0, y: 0, k: 1 },
    nodes: [
        { id: "text-a", type: CanvasNodeType.Text, title: "文字", position: { x: 0, y: 0 }, width: 200, height: 100, metadata: { content: "正文", model: "private-model", prompt: "private-prompt" } },
        { id: "config-a", type: CanvasNodeType.Config, title: "配置", position: { x: 300, y: 0 }, width: 200, height: 100, metadata: { content: "private-config" } },
    ],
};

describe("local CLI canvas proposals", () => {
    test("sends only text and canvas geometry, without configuration metadata", () => {
        const serialized = JSON.stringify(cliCanvasSnapshot(snapshot));
        expect(serialized).toContain("正文");
        expect(serialized).not.toContain("private-");
    });
    test("accepts a proposal and binds references to existing or newly added nodes", () => {
        expect(validateCliCanvasOps([
            { type: "add_node", id: "text-b", nodeType: "text", metadata: { content: "新增" } },
            { type: "connect_nodes", fromNodeId: "text-a", toNodeId: "text-b" },
        ], snapshot)).toHaveLength(2);
    });
    test("rejects paid generation and arbitrary node patches", () => {
        expect(() => validateCliCanvasOps([{ type: "run_generation", nodeId: "text-a" }], snapshot)).toThrow();
        expect(() => validateCliCanvasOps([{ type: "update_node", id: "text-a", patch: { id: "another", metadata: { model: "paid-model" } } }], snapshot)).toThrow();
        expect(() => validateCliCanvasOps([{ type: "update_node", id: "config-a", metadata: { content: "secret" } }], snapshot)).toThrow();
    });
    test("rejects stale references, duplicate IDs, and invalid geometry before applying anything", () => {
        expect(() => validateCliCanvasOps([{ type: "delete_node", ids: ["missing"] }], snapshot)).toThrow();
        expect(() => validateCliCanvasOps([{ type: "add_node", id: "text-a", nodeType: "text" }], snapshot)).toThrow();
        expect(() => validateCliCanvasOps([{ type: "set_viewport", viewport: { x: 0, y: 0, k: 0 } }], snapshot)).toThrow();
    });
    test("keeps ordinary text and reports invalid proposals without partial operations", () => {
        expect(parseCliCanvasReply("普通回答", snapshot)).toEqual({ text: "普通回答" });
        const result = parseCliCanvasReply(JSON.stringify({ reply: "提案", ops: [{ type: "run_generation", nodeId: "text-a" }] }), snapshot);
        expect(result.text).toBe("提案");
        expect(result.ops).toBeUndefined();
        expect(result.error).toBeTruthy();
    });
    test("updates the visible generated text slot while preserving other results", () => {
        const generated: CanvasAgentSnapshot = { ...snapshot, nodes: [{ ...snapshot.nodes[0], metadata: { content: "原文", primaryTextId: "slot-a", texts: [{ id: "slot-a", status: "success", content: "原文" }, { id: "slot-b", status: "success", content: "另一个结果" }] } }] };
        const [op] = prepareCliCanvasOps([{ type: "update_node", id: "text-a", metadata: { content: "新正文" } }], generated);
        expect(op.type === "update_node" && op.metadata?.texts?.map((text) => text.content)).toEqual(["新正文", "另一个结果"]);
    });
});
