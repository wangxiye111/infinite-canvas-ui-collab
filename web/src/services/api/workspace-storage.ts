import localforage from "localforage";
import { useWorkspaceStatusStore } from "@/stores/use-workspace-status-store";

type Entry = { key: string; revision: string; deleted?: boolean };
const stores = new Map<string, ReturnType<typeof makeStore>>();
export const usesLocalWorkspace = () => typeof location !== "undefined" && ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
async function request(namespace: string, key?: string, data?: unknown) {
    try {
    const response = await fetch(`/api/connectors/workspace/${namespace}${key === undefined ? "" : `/${encodeURIComponent(key)}`}`, data === undefined ? undefined : { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "本机项目保存失败");
    return result;
    } catch (cause) {
        const error = cause instanceof Error ? cause.message : "本机项目保存失败";
        useWorkspaceStatusStore.setState({ error: `${error}。当前页面的改动可能尚未保存，请先导出画布备份，不要清理浏览器数据。` });
        throw cause;
    }
}
function makeStore(namespace: string, local: LocalForage, onlyKey?: string) {
    const revisions = new Map<string, string>();
    let initialization: Promise<void> | undefined;
    let readFailure: unknown;
    let writes: Promise<unknown> = Promise.resolve();
    const serialize = async (value: unknown) => {
        const serializer = await localforage.getSerializer();
        return new Promise<string>((resolve, reject) => serializer.serialize(value, (text, error) => error ? reject(error) : resolve(text)));
    };
    const initialize = () => initialization ??= (async () => {
        const { entries } = await request(namespace) as { entries: Entry[] };
        entries.forEach(entry => revisions.set(entry.key, entry.revision));
        const keys = onlyKey ? [onlyKey] : await local.keys();
        for (const key of keys) {
            if (revisions.has(key)) continue;
            const value = await local.getItem(key);
            if (value === null) continue;
            const result = await request(namespace, key, { revision: null, value: await serialize(value) });
            revisions.set(key, result.revision);
        }
    })();
    return {
        async getItem<T>(key: string): Promise<T | null> {
            if (!usesLocalWorkspace()) return local.getItem<T>(key);
            try {
            await initialize();
            const { record } = await request(namespace, key);
            if (record) revisions.set(key, record.revision);
            return record?.value == null ? null : (await localforage.getSerializer()).deserialize(record.value) as T;
            } catch (cause) {
                readFailure = cause;
                useWorkspaceStatusStore.setState({ error: "本机历史读取失败，已阻止写入以保留原数据。请保留当前页面，检查服务后重新打开。" });
                throw cause;
            }
        },
        async setItem<T>(key: string, value: T): Promise<T> {
            if (!usesLocalWorkspace()) return local.setItem(key, value);
            const write = writes.catch(() => {}).then(async () => {
                if (readFailure) throw readFailure;
                await initialize();
                const result = await request(namespace, key, { revision: revisions.get(key) ?? null, value: await serialize(value) });
                revisions.set(key, result.revision);
            });
            writes = write;
            await write;
            return value;
        },
        async removeItem(key: string) {
            if (!usesLocalWorkspace()) return local.removeItem(key);
            const write = writes.catch(() => {}).then(async () => {
                if (readFailure) throw readFailure;
                await initialize();
                const result = await request(namespace, key, { revision: revisions.get(key) ?? null, value: null });
                revisions.set(key, result.revision);
            });
            writes = write;
            await write;
        },
        async keys(): Promise<string[]> {
            if (!usesLocalWorkspace()) return local.keys();
            await initialize();
            const { entries } = await request(namespace) as { entries: Entry[] };
            return entries.filter(entry => !entry.deleted).map(entry => entry.key);
        },
        async iterate<T, U>(callback: (value: T, key: string, iteration: number) => U): Promise<U> {
            let iteration = 0;
            for (const key of await this.keys()) {
                const value = await this.getItem<T>(key);
                if (value === null) continue;
                const result = callback(value, key, ++iteration);
                if (result !== undefined) return result;
            }
            return undefined as U;
        },
        async clear() { for (const key of await this.keys()) await this.removeItem(key); },
    };
}
export function workspaceStore(namespace: string, local?: LocalForage, onlyKey?: string) {
    if (!stores.has(namespace)) stores.set(namespace, makeStore(namespace, local || localforage.createInstance({ name: "infinite-canvas", storeName: namespace }), onlyKey));
    return stores.get(namespace)!;
}
export async function prepareWorkspaceMedia() {
    if (!usesLocalWorkspace()) return;
    // Copy existing source blobs before publishing canvas references to other browsers.
    for (const namespace of ["image_files", "media_files", "image_generation_logs", "video_generation_logs"]) await workspaceStore(namespace).keys();
}
