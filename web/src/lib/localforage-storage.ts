import localforage from "localforage";
import type { StateStorage } from "zustand/middleware";
import { workspaceStore, prepareWorkspaceMedia, usesLocalWorkspace } from "@/services/api/workspace-storage";

localforage.config({
    name: "infinite-canvas",
    storeName: "app_state",
});

export const localForageStorage: StateStorage = {
    getItem: async (name) => {
        if (typeof window === "undefined") return null;
        if (usesLocalWorkspace() && ["infinite-canvas:canvas_store", "infinite-canvas:asset_store"].includes(name)) {
            await prepareWorkspaceMedia();
            return workspaceStore(name.endsWith("canvas_store") ? "canvas_state" : "asset_state", localforage, name).getItem<string>(name);
        }
        try {
            return (await localforage.getItem<string>(name)) || null;
        } catch {
            return window.localStorage.getItem(name);
        }
    },
    setItem: async (name, value) => {
        if (typeof window === "undefined") return;
        if (usesLocalWorkspace() && ["infinite-canvas:canvas_store", "infinite-canvas:asset_store"].includes(name)) {
            await workspaceStore(name.endsWith("canvas_store") ? "canvas_state" : "asset_state", localforage, name).setItem(name, value);
            return;
        }
        try {
            await localforage.setItem(name, value);
        } catch {
            window.localStorage.setItem(name, value);
        }
    },
    removeItem: async (name) => {
        if (typeof window === "undefined") return;
        if (usesLocalWorkspace() && ["infinite-canvas:canvas_store", "infinite-canvas:asset_store"].includes(name)) {
            await workspaceStore(name.endsWith("canvas_store") ? "canvas_state" : "asset_state", localforage, name).removeItem(name);
            return;
        }
        try {
            await localforage.removeItem(name);
        } catch {
            window.localStorage.removeItem(name);
        }
    },
};
