import type { ConnectorPreset } from "../../services/api/connectors";

type Target = { nodeId: string; fieldName: string };
export type RunningHubFields = {
    outputKind: "image" | "video" | "audio" | "model3d";
    promptNodeId?: string;
    promptFieldName?: string;
    inputs: (Target & { role: string })[];
    parameters: (Target & { valueType: "text" | "number" | "boolean" | "json"; value: string })[];
};
const text = (value: unknown, label: string) => {
    if (typeof value !== "string" || !value.trim()) throw new Error(`请填写${label}`);
    return value.trim();
};
const record = (value: unknown, keys: string[]) => {
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) throw new Error("包含表单未支持的字段，请保留高级 JSON 编辑");
    return value as Record<string, unknown>;
};
const openRecord = (value: unknown) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("字段映射必须是对象");
    return value as Record<string, unknown>;
};
const list = (value: unknown) => {
    if (value === undefined) return [];
    if (!Array.isArray(value)) throw new Error("映射和参数必须为列表");
    return value;
};
const target = (value: Record<string, unknown>): Target => ({ nodeId: text(value.nodeId, "节点 ID"), fieldName: text(value.fieldName, "字段名称") });
const outputKind = (value: unknown): RunningHubFields["outputKind"] => {
    if (value === undefined) return "image";
    if (value !== "image" && value !== "video" && value !== "audio" && value !== "model3d") throw new Error("请选择有效的输出类型");
    return value;
};

export function parseRunningHubParams(value: unknown): RunningHubFields {
    const params = record(value ?? {}, ["outputKind", "promptTarget", "inputTargets", "nodeInfoList"]);
    const prompt = params.promptTarget === undefined ? undefined : target(record(params.promptTarget, ["nodeId", "fieldName"]));
    return {
        outputKind: outputKind(params.outputKind),
        promptNodeId: prompt?.nodeId,
        promptFieldName: prompt?.fieldName,
        inputs: list(params.inputTargets).map(item => {
            const input = record(item, ["role", "nodeId", "fieldName"]);
            return { ...target(input), role: text(input.role, "素材角色") };
        }),
        parameters: list(params.nodeInfoList).map(item => {
            const parameter = record(item, ["nodeId", "fieldName", "fieldValue"]);
            if (!Object.hasOwn(parameter, "fieldValue")) throw new Error("固定参数缺少值");
            const value = parameter.fieldValue;
            const valueType = typeof value === "string" ? "text" : typeof value === "number" ? "number" : typeof value === "boolean" ? "boolean" : "json";
            const serialized = typeof value === "string" ? value : JSON.stringify(value);
            if (typeof serialized !== "string") throw new Error("固定参数缺少有效值");
            return { ...target(parameter), valueType, value: serialized };
        }),
    };
}

// Validate known semantics without replacing advanced JSON or discarding extra fields.
export function validateRunningHubParams(params: Record<string, unknown>) {
    const known = {
        outputKind: params.outputKind,
        ...(params.promptTarget !== undefined ? { promptTarget: target(openRecord(params.promptTarget)) } : {}),
        inputTargets: list(params.inputTargets).map(item => { const input = openRecord(item); return { ...target(input), role: input.role }; }),
        nodeInfoList: list(params.nodeInfoList).map(item => { const parameter = openRecord(item); return { ...target(parameter), fieldValue: parameter.fieldValue }; }),
    };
    buildRunningHubParams(parseRunningHubParams(known));
}

export function buildRunningHubParams(fields: RunningHubFields): Record<string, unknown> {
    const used = new Set<string>();
    const claim = (node: Target) => {
        const normalized = target(node);
        const key = JSON.stringify([normalized.nodeId, normalized.fieldName]);
        if (used.has(key)) throw new Error(`字段映射冲突：节点 ${normalized.nodeId} 的 ${normalized.fieldName} 被重复使用`);
        used.add(key);
        return normalized;
    };
    const promptTarget = fields.promptNodeId?.trim() || fields.promptFieldName?.trim()
        ? claim({ nodeId: text(fields.promptNodeId, "提示词节点 ID"), fieldName: text(fields.promptFieldName, "提示词字段名称") }) : undefined;
    const roles = new Set<string>();
    const inputTargets = (fields.inputs || []).map(input => {
        const role = text(input.role, "素材角色");
        if (roles.has(role)) throw new Error(`素材角色重复：${role}`);
        roles.add(role);
        return { role, ...claim(input) };
    });
    const nodeInfoList = (fields.parameters || []).map(parameter => {
        let fieldValue: unknown = parameter.value ?? "";
        const value = String(fieldValue).trim();
        if (parameter.valueType === "number") {
            // JSON number parsing rejects empty text, hex and non-finite values.
            try { fieldValue = JSON.parse(value); } catch { throw new Error("数字参数需要有效的数字"); }
            if (typeof fieldValue !== "number" || !Number.isFinite(fieldValue)) throw new Error("数字参数需要有效的数字");
        } else if (parameter.valueType === "boolean") {
            if (value !== "true" && value !== "false") throw new Error("开关参数请填写 true 或 false");
            fieldValue = value === "true";
        } else if (parameter.valueType === "json") {
            try { fieldValue = JSON.parse(value); } catch { throw new Error("参数值不是有效的 JSON"); }
        } else if (parameter.valueType !== "text") throw new Error("请选择参数值类型");
        return { ...claim(parameter), fieldValue };
    });
    return { outputKind: outputKind(fields.outputKind), ...(promptTarget ? { promptTarget } : {}), inputTargets, nodeInfoList };
}

export function runningHubInputRoles(preset?: Pick<ConnectorPreset, "provider" | "params">): string[] {
    if (preset?.provider !== "runninghub" || !Array.isArray(preset.params?.inputTargets)) return [];
    return preset.params.inputTargets.map(input => text(input?.role, "素材角色"));
}

export function validateRunningHubInputs(preset: Pick<ConnectorPreset, "provider" | "params">, roles: string[]) {
    if (preset.provider !== "runninghub") return;
    const expected = runningHubInputRoles(preset);
    if (new Set(expected).size !== expected.length) throw new Error("工作流的素材角色重复，请编辑预设");
    if (new Set(roles).size !== roles.length) throw new Error("每个素材角色只能分配一次");
    for (const role of roles) if (!expected.includes(role)) throw new Error(`素材角色「${role}」未在工作流中配置`);
    for (const role of expected) if (!roles.includes(role)) throw new Error(`请连接素材并指定「${role}」角色`);
}
