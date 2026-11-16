import localforage from "localforage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { connectorProviderNames, connectorsApi, type ConnectorJob, type ConnectorPreset, type ConnectorProvider } from "@/services/api/connectors";

type ManagerTab = "connections" | "presets" | "jobs";
export const useConnectorManagerStore = create<{ isOpen: boolean; tab: ManagerTab; setTab: (tab: ManagerTab) => void; openManager: () => void; closeManager: () => void }>((set) => ({
    isOpen: false,
    tab: "connections",
    setTab: (tab) => set({ tab }),
    openManager: () => set({ isOpen: true }),
    closeManager: () => set({ isOpen: false }),
}));

const presetStorage = localforage.createInstance({ name: "infinite-canvas", storeName: "connector_presets" });
type ConnectorsState = {
    presets: ConnectorPreset[];
    providers: ConnectorProvider[];
    jobs: ConnectorJob[];
    loading: boolean;
    error: string;
    load: () => Promise<void>;
    savePreset: (preset: ConnectorPreset) => void;
    removePreset: (id: string) => void;
    setProvider: (provider: ConnectorProvider) => void;
    setJob: (job: ConnectorJob) => void;
};
let loading: Promise<void> | undefined;
export const useConnectorsStore = create<ConnectorsState>()(
    persist(
        (set) => ({
            presets: [],
            providers: [],
            jobs: [],
            loading: false,
            error: "",
            load: () => {
                if (loading) return loading;
                set({ loading: true, error: "" });
                loading = Promise.all([connectorsApi.providers(), connectorsApi.jobs()])
                    .then(async ([{ providers }, { jobs }]) => {
                        providers = await Promise.all(providers.map(provider => ["kling", "jimeng"].includes(provider.id) && provider.state === "not-connected" ? connectorsApi.checkProvider(provider.id) : provider));
                        set({ providers: providers.filter((provider) => Object.hasOwn(connectorProviderNames, provider.id)), jobs: jobs.filter((job) => Object.hasOwn(connectorProviderNames, job.provider)) });
                    })
                    .catch((error: unknown) => {
                        set({ error: error instanceof Error ? error.message : "连接服务读取失败", providers: [] });
                    })
                    .finally(() => {
                        loading = undefined;
                        set({ loading: false });
                    });
                return loading;
            },
            savePreset: (preset) => set((state) => ({ presets: state.presets.some((item) => item.id === preset.id) ? state.presets.map((item) => (item.id === preset.id ? preset : item)) : [...state.presets, preset] })),
            removePreset: (id) => set((state) => ({ presets: state.presets.filter((preset) => preset.id !== id) })),
            setProvider: (provider) => set((state) => ({ providers: [...state.providers.filter((item) => item.id !== provider.id), provider] })),
            setJob: (job) => set((state) => ({ jobs: [job, ...state.jobs.filter((item) => item.id !== job.id)] })),
        }),
        {
            name: "presets",
            storage: createJSONStorage(() => ({
                getItem: (name) => presetStorage.getItem<string>(name),
                setItem: async (name, value) => {
                    await presetStorage.setItem(name, value);
                },
                removeItem: (name) => presetStorage.removeItem(name),
            })),
            partialize: (state) => ({ presets: state.presets }),
        },
    ),
);
