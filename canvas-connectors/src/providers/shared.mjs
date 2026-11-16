import { readFile } from "node:fs/promises";

export const required = (value, label) => {
  if (typeof value !== "string" || !value.trim())
    throw new Error(`请填写${label}`);
  return value.trim();
};
export function params(job, allowed) {
  const value = job.preset.params ?? {};
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("预设参数必须是 JSON 对象");
  for (const key of Object.keys(value))
    if (!allowed.includes(key)) throw new Error(`不支持的预设参数：${key}`);
  return value;
}
export function options(value = {}, allowed = []) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("options 必须是对象");
  for (const [key, item] of Object.entries(value)) {
    if (!allowed.includes(key)) throw new Error(`不支持的模型参数：${key}`);
    if (
      !["string", "number", "boolean"].includes(typeof item) ||
      (typeof item === "number" && !Number.isFinite(item))
    )
      throw new Error("模型参数必须是字符串、有限数字或布尔值");
  }
  return value;
}
export const configured = (config, fields) =>
  fields.every((key) => typeof config[key] === "string" && config[key].trim())
    ? { state: "configured", message: "已保存凭据，尚未检查账户权限与额度" }
    : { state: "not-connected", message: "请先配置平台凭据" };
export function credentials(config, fields) {
  for (const key of fields) required(config[key], "平台凭据");
}
export async function request(ctx, url, init = {}) {
  let response;
  try {
    response = await ctx.fetch(url, { ...init, redirect: "error" });
  } catch {
    throw new Error(
      "平台请求未完成，请检查连接；已提交的任务请继续查询，勿重复提交",
    );
  }
  if (!response.ok) throw new Error(`平台请求失败（HTTP ${response.status}）`);
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("平台返回了无法解析的 JSON");
  }
  if (data.code !== undefined && ![0, "0", 200, "200"].includes(data.code)) {
    const code = /^\d+$/.test(String(data.code)) ? `（${data.code}）` : "";
    throw new Error(`平台拒绝请求${code}，请检查账户、预设与平台任务记录`);
  }
  return data;
}
export const json = (body, headers = {}) => ({
  method: "POST",
  headers: { "Content-Type": "application/json", ...headers },
  body: JSON.stringify(body),
});
export const bearer = (config) => ({
  Authorization: `Bearer ${required(config.apiKey, "API Key")}`,
});
export async function filePart(ctx, input) {
  const file = await ctx.getFile(required(input.fileId, "文件 ID"));
  return {
    file,
    blob: new Blob([await readFile(file.path)], {
      type: file.mimeType || "application/octet-stream",
    }),
  };
}
export function inputFor(job, role = "image") {
  const matches = (job.inputs ?? []).filter(
    (input) => (input.role || "image") === role,
  );
  if (matches.length !== 1)
    throw new Error(`需要且只能连接一份 ${role} 输入素材`);
  return matches[0];
}
export function remoteId(job) {
  return required(job.remoteId, "已提交任务 ID");
}
export function state(value, mapping) {
  const status = mapping[String(value).toLowerCase()];
  if (!status)
    throw new Error("平台返回未知任务状态；请保留任务 ID 并在平台核查");
  return status;
}
export function output(url, kind, name) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password)
    throw new Error("平台结果地址格式不受支持");
  return { url: parsed.href, kind, ...(name ? { name } : {}) };
}
export function setPath(target, path, value) {
  if (
    !Array.isArray(path) ||
    !path.length ||
    path.some(
      (key) =>
        typeof key !== "string" ||
        !key ||
        ["__proto__", "prototype", "constructor"].includes(key),
    )
  )
    throw new Error("字段映射 path 必须是非空字符串数组");
  let cursor = target;
  for (const key of path.slice(0, -1)) {
    if (
      !Object.hasOwn(cursor, key) ||
      !cursor[key] ||
      typeof cursor[key] !== "object"
    )
      throw new Error("字段映射路径不存在，请使用平台提供的 API 参数");
    cursor = cursor[key];
  }
  if (!Object.hasOwn(cursor, path.at(-1)))
    throw new Error("字段映射路径不存在，请使用平台提供的 API 参数");
  cursor[path.at(-1)] = value;
}
export function bindNode(list, target, value) {
  const nodeId = required(target.nodeId, "映射节点 ID");
  const fieldName = required(target.fieldName, "映射字段");
  const existing = list.find(
    (node) => node.nodeId === nodeId && node.fieldName === fieldName,
  );
  if (existing) existing.fieldValue = value;
  else list.push({ nodeId, fieldName, fieldValue: value });
}
export function validateInputs(job, targets = []) {
  if (!Array.isArray(targets)) throw new Error("inputTargets 必须是数组");
  const roles = targets.map((target) => required(target.role, "输入映射角色"));
  if (new Set(roles).size !== roles.length)
    throw new Error("每个输入角色只能映射一次，请使用不同角色");
  for (const input of job.inputs ?? [])
    if (!roles.includes(input.role || "image"))
      throw new Error(`输入 ${input.role || "image"} 尚未配置字段映射`);
}
export function progress(value, scale = 1) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(100, Math.max(0, value * scale))
    : undefined;
}

export function nonempty(outputs) {
  if (!outputs.length)
    throw Object.assign(new Error(
      "平台任务显示成功，但没有可保存的结果；请保留任务 ID 并刷新同一任务核查",
    ), { code: "RESULT_SAVE_FAILED" });
  return outputs;
}
