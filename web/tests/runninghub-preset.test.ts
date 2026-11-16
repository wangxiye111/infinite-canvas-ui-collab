import assert from "node:assert/strict";
import { test } from "node:test";
import * as workflow from "../src/lib/connectors/runninghub-preset.ts";

const params = {
    outputKind: "video",
    promptTarget: { nodeId: "6", fieldName: "text" },
    inputTargets: [{ role: "first_frame", nodeId: "12", fieldName: "image" }, { role: "last_frame", nodeId: "13", fieldName: "image" }],
    nodeInfoList: [{ nodeId: "3", fieldName: "seed", fieldValue: 123 }, { nodeId: "3", fieldName: "enabled", fieldValue: false }, { nodeId: "9", fieldName: "text", fieldValue: "  原样保留\n提示词  " }, { nodeId: "5", fieldName: "options", fieldValue: { steps: [1, 2] } }],
};

test("RunningHub form preserves prompt, reference mappings and typed fixed values", () => {
    assert.deepEqual(workflow.buildRunningHubParams(workflow.parseRunningHubParams(params)), params);
    const empty = workflow.parseRunningHubParams({});
    assert.deepEqual(workflow.buildRunningHubParams(empty), { outputKind: "image", nodeInfoList: [], inputTargets: [] });
});

test("RunningHub refuses duplicate roles and targets before saving a preset", () => {
    for (const invalid of [
        { ...params, inputTargets: [...params.inputTargets, { role: "first_frame", nodeId: "14", fieldName: "image" }] },
        { ...params, inputTargets: [{ role: "image", nodeId: "6", fieldName: "text" }] },
        { ...params, nodeInfoList: [...params.nodeInfoList, { nodeId: "12", fieldName: "image", fieldValue: "overwritten.png" }] },
    ]) assert.throws(() => workflow.buildRunningHubParams(workflow.parseRunningHubParams(invalid)), /重复|冲突/);
});

test("RunningHub retains unsupported presets in advanced mode instead of dropping unknown fields", () => {
    for (const invalid of [
        { ...params, unrecognized: true },
        { ...params, inputTargets: [{ ...params.inputTargets[0], custom: true }] },
        { ...params, nodeInfoList: [{ nodeId: "3", fieldName: "seed", fieldValue: 5, description: "keep me" }] },
        { outputKind: "binary" },
    ]) assert.throws(() => workflow.parseRunningHubParams(invalid));
});

test("RunningHub rejects incomplete targets and invalid number, boolean or JSON values", () => {
    const fields = workflow.parseRunningHubParams(params);
    assert.throws(() => workflow.buildRunningHubParams({ ...fields, promptFieldName: "" }), /提示词/);
    for (const [valueType, value] of [["number", ""], ["number", "Infinity"], ["number", "0x20"], ["boolean", "yes"], ["json", "{"]] as const) {
        assert.throws(() => workflow.buildRunningHubParams({ ...fields, parameters: [{ nodeId: "8", fieldName: "value", valueType, value }] }), /参数/);
    }
});

test("RunningHub input validation catches missing, unmapped and duplicate references before upload", () => {
    const preset = { provider: "runninghub", params } as Parameters<typeof workflow.runningHubInputRoles>[0];
    assert.deepEqual(workflow.runningHubInputRoles(preset), ["first_frame", "last_frame"]);
    workflow.validateRunningHubInputs(preset, ["last_frame", "first_frame"]);
    for (const roles of [["image"], ["first_frame"], ["first_frame", "first_frame", "last_frame"]]) assert.throws(() => workflow.validateRunningHubInputs(preset, roles));
});

test("advanced RunningHub validation preserves extra fields but rejects conflicting known mappings", () => {
    const advanced = { ...params, extra: "preserved", nodeInfoList: [{ nodeId: "3", fieldName: "seed", fieldValue: 123, description: "keep me" }] };
    const before = JSON.stringify(advanced);
    workflow.validateRunningHubParams(advanced);
    assert.equal(JSON.stringify(advanced), before);
    for (const invalid of [
        { ...advanced, inputTargets: [{ role: "image", nodeId: "6", fieldName: "text" }] },
        { ...advanced, nodeInfoList: [advanced.nodeInfoList[0], advanced.nodeInfoList[0]] },
        { ...advanced, inputTargets: [params.inputTargets[0], params.inputTargets[0]] },
    ]) assert.throws(() => workflow.validateRunningHubParams(invalid), /冲突|重复/);
});
