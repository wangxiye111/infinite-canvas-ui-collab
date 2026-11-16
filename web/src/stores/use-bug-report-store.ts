import { create } from "zustand";
import { workspaceStore } from "@/services/api/workspace-storage";

export const bugStatuses = ["待排查", "修复中", "待你验收", "已关闭"] as const;
export type BugStatus = typeof bugStatuses[number];
export type BugRegion = { x: number; y: number; width: number; height: number };
export type BugReport = {
    id: string;
    title: string;
    actual: string;
    expected: string;
    steps: string;
    resolution: string;
    status: BugStatus;
    path: string;
    label: string;
    nodeId?: string;
    region: BugRegion;
    viewport: { width: number; height: number };
    createdAt: string;
    updatedAt: string;
};
const storage = workspaceStore("bug_reports");
type BugStore = {
    reports: BugReport[];
    busy: boolean;
    error: string;
    load: () => Promise<void>;
    save: (report: BugReport) => Promise<boolean>;
};
export const useBugReportStore = create<BugStore>((set, get) => ({
    reports: [],
    busy: false,
    error: "",
    load: async () => {
        if (get().busy) return;
        set({ busy: true, error: "" });
        try {
            const reports: BugReport[] = [];
            await storage.iterate<BugReport, void>(report => { reports.push(report); });
            set({ reports: reports.sort((a, b) => b.createdAt.localeCompare(a.createdAt)) });
        } catch (error) {
            set({ error: error instanceof Error ? error.message : "Bug 清单读取失败" });
        } finally { set({ busy: false }); }
    },
    save: async report => {
        if (get().busy) return false;
        set({ busy: true, error: "" });
        try {
            await storage.setItem(report.id, report);
            set(state => ({ reports: [report, ...state.reports.filter(item => item.id !== report.id)].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) }));
            return true;
        } catch (error) {
            set({ error: error instanceof Error ? error.message : "保存失败，请保留填写内容后重试" });
            return false;
        } finally { set({ busy: false }); }
    },
}));

export function bugMarkdown(reports: BugReport[]) {
    return reports.map(report => [
        `## ${report.id} · ${report.title}`,
        `状态：${report.status}`,
        `页面：${report.path}`,
        `标注对象：${report.label || "框选区域"}${report.nodeId ? `（节点 ${report.nodeId}）` : ""}`,
        `区域：${JSON.stringify(report.region)}，视口：${report.viewport.width} × ${report.viewport.height}`,
        `实际表现：\n${report.actual}`,
        `期望效果／验收条件：\n${report.expected || "待补充"}`,
        `复现步骤：\n${report.steps || "待补充"}`,
        `排查与修复记录：\n${report.resolution || "待排查"}`,
    ].join("\n\n")).join("\n\n");
}
