export type ConnectorProviderId = "kling" | "jimeng" | "runninghub" | "tripo" | "liblib";
export type ConnectorAction = { id: string; label: string; output: "image" | "video" | "model3d"; requiresModel?: boolean; requiresRemoteId?: boolean; canCancel?: boolean };
export type ConnectorProvider = {
    id: ConnectorProviderId;
    name: string;
    auth: "cli" | "api";
    state: "not-installed" | "not-connected" | "configured" | "ready" | "error";
    message: string;
    billing: string;
    docs: string;
    fields: Array<{ key: string; label: string; secret?: boolean; placeholder?: string }>;
    actions: ConnectorAction[];
    config: Record<string, string>;
    configuredFields?: string[];
    details?: unknown;
};
export type ConnectorPreset = { id: string; name: string; provider: ConnectorProviderId; action: string; model?: string; remoteId?: string; params?: Record<string, unknown> };
export type ConnectorInput = { fileId: string; role?: string };
export type ConnectorOutput = { id: string; url: string; name: string; mimeType: string; kind: "image" | "video" | "audio" | "model3d" };
export type ConnectorJob = {
    id: string;
    requestId: string;
    provider: ConnectorProviderId;
    preset: ConnectorPreset;
    prompt: string;
    inputs: ConnectorInput[];
    canvasId?: string;
    nodeId?: string;
    status: "submitting" | "queued" | "running" | "saving" | "save_failed" | "query_failed" | "succeeded" | "failed" | "interrupted" | "cancelled";
    remoteId?: string;
    remoteContext?: Record<string, unknown>;
    progress?: number;
    message?: string;
    outputs: ConnectorOutput[];
    createdAt: string;
    updatedAt: string;
};
export type ConnectorLogin = { id: string; status: "running" | "succeeded" | "failed"; message: string; url?: string; code?: string };
export type ConnectorSubmit = Pick<ConnectorJob, "requestId" | "provider" | "preset" | "prompt" | "inputs" | "canvasId" | "nodeId">;

const base = "/api/connectors";
// Existing platform-task polling cadence, shared by ordinary image/video nodes.
export const CONNECTOR_POLL_INTERVAL_MS = 2500;
async function request<T>(path: string, init?: RequestInit): Promise<T> {
    let response: Response;
    try {
        response = await fetch(`${base}${path}`, init);
    } catch {
        throw new Error("本地连接服务不可用，请先启动 canvas-connectors 服务。");
    }
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error || `连接服务请求失败（${response.status}）`);
    if (!data || typeof data !== "object") throw new Error("本地连接服务未返回有效数据，请检查当前服务地址。");
    return data as T;
}
function json(method: string, body?: unknown): RequestInit {
    return { method, headers: { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) };
}
export const connectorsApi = {
    health: () => request<{ ok: true; version: string }>("/health"),
    providers: () => request<{ providers: ConnectorProvider[] }>("/providers"),
    saveProvider: (id: ConnectorProviderId, config: Record<string, string>) => request<ConnectorProvider>(`/providers/${id}`, json("PUT", { config })),
    checkProvider: (id: ConnectorProviderId) => request<ConnectorProvider>(`/providers/${id}/check`, json("POST")),
    detectProvider: (id: ConnectorProviderId) => request<ConnectorProvider>(`/providers/${id}/detect`, json("POST")),
    login: (id: ConnectorProviderId) => request<{ loginId: string; status: ConnectorLogin["status"]; message: string }>(`/providers/${id}/login`, json("POST")),
    loginStatus: (id: string) => request<ConnectorLogin>(`/logins/${encodeURIComponent(id)}`),
    upload: (blob: Blob, name: string) =>
        request<{ id: string; name: string; mimeType: string; bytes: number }>(`/files?name=${encodeURIComponent(name)}`, { method: "POST", headers: { "Content-Type": blob.type || "application/octet-stream" }, body: blob }),
    submit: (body: ConnectorSubmit) => request<ConnectorJob>("/jobs", json("POST", body)),
    jobs: () => request<{ jobs: ConnectorJob[] }>("/jobs"),
    job: (id: string) => request<ConnectorJob>(`/jobs/${encodeURIComponent(id)}`),
    refresh: (id: string) => request<ConnectorJob>(`/jobs/${encodeURIComponent(id)}/refresh`, json("POST")),
    cancel: (id: string) => request<ConnectorJob>(`/jobs/${encodeURIComponent(id)}/cancel`, json("POST")),
    outputBlob: async (output: ConnectorOutput) => {
        const url = new URL(output.url, window.location.origin);
        if (url.origin !== window.location.origin || !url.pathname.startsWith(`${base}/files/`)) throw new Error("任务结果不是本地连接服务文件。");
        const response = await fetch(url);
        if (!response.ok) throw new Error(`任务结果读取失败（${response.status}）`);
        const blob = await response.blob();
        return blob.type ? blob : blob.slice(0, blob.size, output.mimeType);
    },
};

export const connectorProviderNames: Record<ConnectorProviderId, string> = { kling: "可灵", jimeng: "即梦", runninghub: "RunningHub", tripo: "Tripo · 国内站", liblib: "Liblib.art" };
export const connectorStateLabels: Record<ConnectorProvider["state"], string> = { "not-installed": "未安装 CLI", "not-connected": "未连接", configured: "已配置，尚未验证额度", ready: "连接检查通过", error: "连接异常" };
export const connectorJobLabels: Record<ConnectorJob["status"], string> = { submitting: "正在提交", queued: "排队中", running: "生成中", saving: "正在保存结果", save_failed: "保存失败", query_failed: "查询暂时失败", succeeded: "已完成", failed: "生成失败", interrupted: "状态待确认", cancelled: "已取消" };
export const isActiveConnectorJob = (job: ConnectorJob) => ["submitting", "queued", "running", "saving"].includes(job.status);
export const canCancelConnectorJob = (job: ConnectorJob) => ["queued", "running", "query_failed"].includes(job.status) && Boolean(job.remoteId);
