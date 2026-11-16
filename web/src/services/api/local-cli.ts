import { LOCAL_CODEX_IMAGE_MODEL, LOCAL_ANTIGRAVITY_IMAGE_MODEL } from "@/lib/local-cli-image-setup";

export { LOCAL_CODEX_IMAGE_MODEL, LOCAL_ANTIGRAVITY_IMAGE_MODEL };
export type LocalCliEngine = "codex-cli" | "gemini-cli" | "antigravity-cli";
export const localCliNames: Record<LocalCliEngine, string> = { "codex-cli": "Codex CLI", "gemini-cli": "Gemini CLI", "antigravity-cli": "Antigravity CLI" };
export const isLocalCliEngine = (value: unknown): value is LocalCliEngine => typeof value === "string" && Object.hasOwn(localCliNames, value);
export type LocalCliLogin = { id: string; loginId?: string; provider: LocalCliEngine; status: "running" | "succeeded" | "failed"; message?: string };
export type LocalAccountEngine = "codex-cli" | "antigravity-cli";
export type LocalAccountSetup = { id: string; engine: LocalAccountEngine; status: "running" | "succeeded" | "failed" | "cancelled"; step: "checking" | "login" | "verifying" | "complete"; message: string; url?: string; provider?: LocalCliProvider };
export type LocalCliProvider = {
    id: LocalCliEngine;
    name: string;
    state: "not-installed" | "not-connected" | "configured" | "ready" | "error";
    message: string;
    billing: string;
    docs: string;
    config: Record<string, string>;
    fields: Array<{ key: string; label: string; secret?: boolean; placeholder?: string }>;
    actions: Array<{ id: string; label: string; output: "text" | "image" }>;
    details?: {
        loginState?: "unchecked" | "authenticated" | "not-authenticated";
        authMethod?: "chatgpt" | "api-key" | "unknown";
        imageAvailable?: boolean;
        imageMessage?: string;
        imageAdapter?: string;
        imageDriverState?: "unchecked" | "available" | "unavailable";
        imageDriverModel?: string;
        imageDriverReasoning?: string;
        imageDriverSource?: "official-model-list";
        quota?: "unknown";
        [key: string]: unknown;
    };
};
export type LocalCliJob = {
    id: string;
    requestId: string;
    provider: LocalCliEngine;
    status: "submitting" | "queued" | "running" | "saving" | "save_failed" | "query_failed" | "succeeded" | "failed" | "interrupted" | "cancelled";
    message?: string;
    progress?: number;
    prompt?: string;
    createdAt?: string;
    updatedAt?: string;
    outputs: Array<{ id: string; url: string; name: string; mimeType: string; kind: "text" | "image" }>;
};
type LocalCliRequest = {
    engine: LocalCliEngine;
    prompt: string;
    action: "text" | "image";
    model?: string;
    messages?: Array<{ role: string; content: string }>;
    mode?: "chat" | "canvas";
    canvas?: object;
    images?: Blob[];
    size?: string;
    quality?: string;
    count?: number;
};
const base = "/api/connectors";
class CliHttpError extends Error {}
async function request<T>(path: string, init?: RequestInit): Promise<T> {
    let response: Response;
    try {
        response = await fetch(`${base}${path}`, init);
    } catch (error) {
        if (init?.signal?.aborted) throw error;
        throw new Error("本地连接服务不可用，请先安装并启动 canvas-connectors 服务。", { cause: error });
    }
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new CliHttpError(data?.error || `本地 CLI 服务请求失败（${response.status}）`);
    if (!data || typeof data !== "object") throw new Error("本地连接服务未返回有效数据，请先启动 canvas-connectors 服务。");
    return data as T;
}
const json = (method: string, body = {}) => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
export const localCliApi = {
    setups: async () => (await request<{ tasks: LocalAccountSetup[] }>("/onboarding")).tasks,
    connectAccount: (engine: LocalAccountEngine) => request<LocalAccountSetup>(`/onboarding/${engine}`, json("POST")),
    cancelSetup: (id: string) => request<LocalAccountSetup>(`/onboarding/${encodeURIComponent(id)}/cancel`, json("POST")),
    providers: async () => (await request<{ providers: LocalCliProvider[] }>("/providers")).providers.filter((provider) => isLocalCliEngine(provider.id)),
    save: (engine: LocalCliEngine, config: Record<string, string>) => request<LocalCliProvider>(`/providers/${engine}`, json("PUT", { config })),
    check: (engine: LocalCliEngine) => request<LocalCliProvider>(`/providers/${engine}/check`, json("POST")),
    login: (engine: LocalCliEngine) => request<LocalCliLogin>(`/providers/${engine}/login`, json("POST")),
    loginStatus: (id: string) => request<LocalCliLogin>(`/logins/${encodeURIComponent(id)}`),
    bootstrapCodex: () => request<{ url: string; token: string }>("/agent/bootstrap", json("POST")),
    jobs: async () => (await request<{ jobs: LocalCliJob[] }>("/jobs")).jobs.filter((job) => isLocalCliEngine(job.provider)),
    refreshJob: (id: string) => request<LocalCliJob>(`/jobs/${encodeURIComponent(id)}/refresh`, json("POST")),
    cancelJob: (id: string) => request<LocalCliJob>(`/jobs/${encodeURIComponent(id)}/cancel`, json("POST")),
    readJobText: async (job: LocalCliJob) => (await Promise.all(job.outputs.filter((output) => output.kind === "text").map(async (output) => (await outputBlob(output)).text()))).join("\n\n"),
};
const active = (job: LocalCliJob) => ["submitting", "queued", "running", "saving"].includes(job.status);
const aborted = () => new DOMException("已取消本次等待", "AbortError");
function waitForRefresh(signal?: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
        if (signal?.aborted) return reject(aborted());
        const cancel = () => { clearTimeout(timer); reject(aborted()); };
        const timer = setTimeout(() => { signal?.removeEventListener("abort", cancel); resolve(); }, 2500);
        signal?.addEventListener("abort", cancel, { once: true });
    });
}
export function localCliOutputUrl(output: LocalCliJob["outputs"][number]) {
    const origin = globalThis.location?.origin || "http://localhost";
    const url = new URL(output.url, origin);
    if (url.origin !== origin || !url.pathname.startsWith(`${base}/files/`)) throw new Error("CLI 结果不是本地连接服务文件。");
    return url.pathname;
}
async function outputBlob(output: LocalCliJob["outputs"][number], signal?: AbortSignal) {
    const response = await fetch(localCliOutputUrl(output), { signal });
    if (!response.ok) throw new Error(`CLI 结果读取失败（${response.status}）`);
    const blob = await response.blob();
    return blob.type ? blob : blob.slice(0, blob.size, output.mimeType);
}
function dataUrl(blob: Blob) {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("CLI 图片读取失败"));
        reader.readAsDataURL(blob);
    });
}

export async function runLocalCli(input: LocalCliRequest, options: { signal?: AbortSignal; onJob?: (job: LocalCliJob) => void } = {}): Promise<{ text: string; images: Array<{ id: string; dataUrl: string }>; jobId: string }> {
    const { signal, onJob } = options;
    if (signal?.aborted) throw aborted();
    const requestId = crypto.randomUUID();
    let job: LocalCliJob | undefined;
    try {
        const inputs = await Promise.all((input.images || []).map(async (blob, index) => {
            const file = await request<{ id: string }>(`/files?name=${encodeURIComponent(blob instanceof File ? blob.name : `reference-${index + 1}`)}`, { method: "POST", headers: { "Content-Type": blob.type || "application/octet-stream" }, body: blob, signal });
            return { fileId: file.id };
        }));
        if (signal?.aborted) throw aborted();
        const { engine, prompt, action, model, messages, mode, canvas, size, quality, count } = input;
        try {
            job = await request<LocalCliJob>("/jobs", { ...json("POST", {
                requestId, provider: engine, prompt, inputs,
                preset: { id: engine, name: localCliNames[engine], provider: engine, action, ...(model && model !== "default" && !(action === "image" && ((engine === "codex-cli" && model === LOCAL_CODEX_IMAGE_MODEL) || (engine === "antigravity-cli" && model === LOCAL_ANTIGRAVITY_IMAGE_MODEL))) ? { model } : {}), params: action === "text" ? { messages, mode, canvas } : { size, quality, count } },
            }), signal });
        } catch (error) {
            if (error instanceof CliHttpError) throw error;
            // A lost response is not permission to submit another paid job.
            const saved = await request<{ jobs: LocalCliJob[] }>("/jobs").catch(() => null);
            job = saved?.jobs.find((item) => item.requestId === requestId && item.provider === engine);
            if (!job) throw new Error(`提交结果待核查，请勿重复生成。请求编号：${requestId}`);
        }
        onJob?.(job);
        while (active(job)) {
            await waitForRefresh(signal);
            job = await request<LocalCliJob>(`/jobs/${encodeURIComponent(job.id)}/refresh`, { ...json("POST"), signal });
            onJob?.(job);
        }
        if (job.status === "save_failed" || job.status === "query_failed") throw new Error(`${job.status === "save_failed" ? "结果保存失败，请到本地任务恢复保存" : "查询暂时失败，请到本地任务恢复查询"}，不要重新生成。任务编号：${job.id}。${job.message || ""}`);
        if (job.status !== "succeeded") throw new Error(job.message || (job.status === "interrupted" ? "CLI 任务状态待核查，请勿重复提交。" : job.status === "cancelled" ? "CLI 任务已取消。" : "CLI 执行失败。"));
        const texts: string[] = [], images: Array<{ id: string; dataUrl: string }> = [];
        for (const output of job.outputs) {
            const blob = await outputBlob(output, signal);
            if (output.kind === "text") texts.push(await blob.text());
            if (output.kind === "image") images.push({ id: output.id, dataUrl: await dataUrl(blob) });
        }
        if (input.action === "image" && !images.length) throw new Error("CLI 未返回图片，请检查本地生图工具配置。");
        return { text: texts.join("\n\n"), images, jobId: job.id };
    } catch (error) {
        if (signal?.aborted && job && ["saving", "save_failed"].includes(job.status)) throw new Error(`已停止等待，平台结果仍需保存。请到本地任务查看原任务，不要重新生成。任务编号：${job.id}`);
        if (signal?.aborted && job && active(job)) {
            const cancelled = await request<LocalCliJob>(`/jobs/${encodeURIComponent(job.id)}/cancel`, json("POST")).catch(() => null);
            if (cancelled) onJob?.(cancelled);
            if (cancelled && ["saving", "save_failed"].includes(cancelled.status)) throw new Error(`已停止等待，平台结果仍需保存。任务编号：${job.id}`);
            if (!cancelled || active(cancelled) || cancelled.status === "interrupted") throw new Error(`取消结果待核查，任务可能仍在运行，请勿重复生成。任务编号：${job.id}`);
            throw aborted();
        }
        if (job && active(job) && !signal?.aborted) throw new Error(`任务状态读取中断，任务可能仍在运行，请勿重复生成。任务编号：${job.id}`);
        throw error;
    }
}
