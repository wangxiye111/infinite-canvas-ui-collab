import { create } from "zustand";

export const useWorkspaceStatusStore = create<{ error: string }>(() => ({ error: "" }));
