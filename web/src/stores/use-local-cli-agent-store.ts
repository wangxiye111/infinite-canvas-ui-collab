import localforage from "localforage";
import { create } from "zustand";

import type { CanvasAgentOp } from "@/lib/canvas/canvas-agent-ops";
import { randomId } from "@/lib/utils";
import type { LocalCliEngine } from "@/services/api/local-cli";

export type LocalCliChatEngine = Exclude<LocalCliEngine, "codex-cli">;
export type LocalCliChatMessage = {
    threadId: string; turnId: string; itemId: string;
    role: "user" | "assistant" | "error"; text: string;
    projectId?: string; projectTitle?: string; ops?: CanvasAgentOp[]; proposalError?: string; applied?: boolean;
};
type LocalCliThread = { id: string; engine: LocalCliChatEngine; title: string; messages: LocalCliChatMessage[] };
type Run = { threadId: string; turnId: string; jobId?: string };
type SavedHistory = { version: 1; threads: LocalCliThread[]; activeThreads: Partial<Record<LocalCliChatEngine, string>>; models: Record<LocalCliChatEngine, string> };
type State = Omit<SavedHistory, "version"> & {
    engine: LocalCliEngine; loaded: boolean; storageError: string;
    prompts: Record<LocalCliChatEngine, string>; runs: Partial<Record<LocalCliChatEngine, Run>>;
    load: () => Promise<void>;
    setEngine: (engine: LocalCliEngine) => void;
    setModel: (engine: LocalCliChatEngine, model: string) => void;
    setPrompt: (engine: LocalCliChatEngine, prompt: string) => void;
    setRun: (engine: LocalCliChatEngine, run?: Run) => void;
    newThread: (engine: LocalCliChatEngine) => string;
    selectThread: (engine: LocalCliChatEngine, threadId: string) => void;
    append: (threadId: string, message: LocalCliChatMessage) => void;
    markApplied: (threadId: string, itemId: string) => void;
};

const storage = localforage.createInstance({ name: "infinite-canvas", storeName: "local_cli_agent" });
let loading: Promise<void> | undefined;
let writing = Promise.resolve();

function save() {
    const { loaded, storageError, threads, activeThreads, models } = useLocalCliAgentStore.getState();
    if (!loaded || storageError) return;
    const history: SavedHistory = { version: 1, threads, activeThreads, models };
    writing = writing.then(() => useLocalCliAgentStore.getState().storageError ? undefined : storage.setItem("history", history)).then(() => undefined).catch(() => {
        useLocalCliAgentStore.setState({ storageError: "对话保存失败，原存储未清除；请保留本页并检查浏览器存储。" });
    });
}

function isHistory(value: unknown): value is SavedHistory {
    if (!value || typeof value !== "object") return false;
    const data = value as SavedHistory;
    return data.version === 1 && Array.isArray(data.threads) && !!data.activeThreads && typeof data.activeThreads === "object" && !Array.isArray(data.activeThreads) && !!data.models
        && ["gemini-cli", "antigravity-cli"].every((engine) => typeof data.models[engine as LocalCliChatEngine] === "string")
        && new Set(data.threads.map((thread) => thread?.id)).size === data.threads.length
        && data.threads.every((thread) => thread && typeof thread.id === "string" && typeof thread.title === "string"
            && (thread.engine === "gemini-cli" || thread.engine === "antigravity-cli") && Array.isArray(thread.messages)
            && thread.messages.every((message) => message && message.threadId === thread.id && typeof message.turnId === "string"
                && typeof message.itemId === "string" && typeof message.text === "string" && ["user", "assistant", "error"].includes(message.role)
                && [message.projectId, message.projectTitle, message.proposalError].every((value) => value === undefined || typeof value === "string")
                && (message.ops === undefined || Array.isArray(message.ops)) && (message.applied === undefined || typeof message.applied === "boolean")))
        && Object.entries(data.activeThreads).every(([engine, id]) => data.threads.some((thread) => thread.id === id && thread.engine === engine));
}

export const useLocalCliAgentStore = create<State>((set, get) => ({
    engine: "codex-cli", loaded: false, storageError: "", threads: [], activeThreads: {},
    models: { "gemini-cli": "", "antigravity-cli": "" }, prompts: { "gemini-cli": "", "antigravity-cli": "" }, runs: {},
    load: () => {
        if (loading) return loading;
        loading = storage.getItem<unknown>("history").then((history) => {
            if (history === null) { set({ loaded: true }); return; }
            if (!isHistory(history)) throw new Error("本地 CLI 对话格式未知或已损坏，已停止写入以保护原记录。请备份浏览器数据后处理。");
            set({ threads: history.threads, activeThreads: history.activeThreads, models: history.models, loaded: true });
        }).catch((error: unknown) => set({ storageError: error instanceof Error ? error.message : "读取本地 CLI 对话失败，已停止写入。" }));
        return loading;
    },
    setEngine: (engine) => set({ engine }),
    setModel: (engine, model) => { set((state) => ({ models: { ...state.models, [engine]: model } })); save(); },
    setPrompt: (engine, prompt) => set((state) => ({ prompts: { ...state.prompts, [engine]: prompt } })),
    setRun: (engine, run) => set((state) => ({ runs: { ...state.runs, [engine]: run } })),
    newThread: (engine) => {
        const id = randomId();
        set((state) => ({ threads: [...state.threads, { id, engine, title: "新对话", messages: [] }], activeThreads: { ...state.activeThreads, [engine]: id } }));
        save(); return id;
    },
    selectThread: (engine, threadId) => {
        if (!get().threads.some((thread) => thread.id === threadId && thread.engine === engine)) return;
        set((state) => ({ activeThreads: { ...state.activeThreads, [engine]: threadId } })); save();
    },
    append: (threadId, message) => {
        set((state) => ({ threads: state.threads.map((thread) => thread.id === threadId ? {
            ...thread,
            title: thread.messages.length ? thread.title : message.text,
            messages: [...thread.messages.filter((item) => item.threadId !== message.threadId || item.turnId !== message.turnId || item.itemId !== message.itemId), message],
        } : thread) })); save();
    },
    markApplied: (threadId, itemId) => {
        set((state) => ({ threads: state.threads.map((thread) => thread.id === threadId ? {
            ...thread, messages: thread.messages.map((message) => message.itemId === itemId ? { ...message, applied: true } : message),
        } : thread) })); save();
    },
}));
