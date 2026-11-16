import { useEffect, useRef, useState, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { App, Button, Drawer, Empty, Input, Modal, Select, Tag } from "antd";
import { Bug, Copy, Download, Scan, X } from "lucide-react";
import { saveAs } from "file-saver";
import copy from "copy-to-clipboard";
import { useLocation, useNavigate } from "react-router-dom";
import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { bugMarkdown, bugStatuses, useBugReportStore, type BugRegion, type BugReport } from "@/stores/use-bug-report-store";

// Keep the entire feedback workflow above application dialogs and their masks.
const feedbackLayer = 10000;

export function BugReporter() {
    const theme = canvasThemes[useThemeStore(state => state.theme)];
    const store = useBugReportStore();
    const { message } = App.useApp();
    const location = useLocation();
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const [marking, setMarking] = useState(false);
    const [region, setRegion] = useState<BugRegion>();
    const [draft, setDraft] = useState<BugReport>();
    const [highlight, setHighlight] = useState<BugReport>();
    const start = useRef<{ x: number; y: number; element: Element | null } | undefined>(undefined);
    const cancel = () => { setMarking(false); setRegion(undefined); start.current = undefined; };
    useEffect(() => {
        const escape = (event: KeyboardEvent) => {
            if (event.key === "Escape" && (marking || highlight)) {
                event.preventDefault();
                event.stopImmediatePropagation();
                setMarking(false); setRegion(undefined); setHighlight(undefined); start.current = undefined;
            }
        };
        window.addEventListener("keydown", escape, true);
        return () => window.removeEventListener("keydown", escape, true);
    }, [marking, highlight]);
    useEffect(() => { if (open) void store.load(); }, [open]); // Refresh when opening, including changes from another browser.
    const begin = () => { setOpen(false); setHighlight(undefined); setRegion(undefined); setMarking(true); };
    const down = (event: PointerEvent<HTMLDivElement>) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        event.currentTarget.style.pointerEvents = "none";
        const element = document.elementFromPoint(event.clientX, event.clientY);
        event.currentTarget.style.pointerEvents = "";
        start.current = { x: event.clientX, y: event.clientY, element };
        setRegion({ x: event.clientX, y: event.clientY, width: 0, height: 0 });
    };
    const rectangle = (x: number, y: number): BugRegion => ({
        x: Math.min(start.current!.x, x), y: Math.min(start.current!.y, y),
        width: Math.abs(x - start.current!.x), height: Math.abs(y - start.current!.y),
    });
    const finish = (event: PointerEvent<HTMLDivElement>) => {
        if (!start.current) return;
        const selected = start.current.element;
        let box = rectangle(event.clientX, event.clientY);
        if (box.width < 4 && box.height < 4 && selected) {
            const bounds = selected.getBoundingClientRect();
            box = { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
        }
        const now = new Date().toISOString();
        setDraft({
            id: `BUG-${crypto.randomUUID()}`, title: "", actual: "", expected: "", steps: "", resolution: "",
            status: "待排查", path: location.pathname, createdAt: now, updatedAt: now,
            label: selected?.getAttribute("aria-label") || selected?.getAttribute("title") || selected?.tagName.toLowerCase() || "框选区域",
            nodeId: selected?.closest("[data-node-id]")?.getAttribute("data-node-id") || undefined,
            region: box, viewport: { width: window.innerWidth, height: window.innerHeight },
        });
        cancel();
    };
    const save = async () => {
        if (!draft?.title.trim() || !draft.actual.trim()) { message.warning("请填写问题标题和实际表现"); return; }
        if (await store.save({ ...draft, title: draft.title.trim(), updatedAt: new Date().toISOString() })) {
            setDraft(undefined); setOpen(true); message.success("已保存到 Bug 清单");
        }
    };
    const copyReports = (reports: BugReport[]) => {
        if (copy(bugMarkdown(reports))) message.success("已复制，可粘贴到 Codex 对话中逐项修复");
        else message.error("复制失败，请使用导出");
    };
    const locate = (report: BugReport) => { setOpen(false); navigate(report.path); setHighlight(report); };
    const highlightedNode = highlight?.path === location.pathname && highlight.nodeId
        ? Array.from(document.querySelectorAll("[data-node-id]")).find(element => element.getAttribute("data-node-id") === highlight.nodeId)?.getBoundingClientRect()
        : undefined;
    const shown = highlight?.path === location.pathname ? highlightedNode || highlight.region : undefined;
    const panelStyle = { background: theme.toolbar.panel, color: theme.node.text, borderColor: theme.node.stroke };
    return createPortal(
        <div data-canvas-shortcuts-ignore>
            {!marking && !draft && !highlight && <button type="button" aria-label="标注问题与 Bug 清单" title="标注问题与 Bug 清单" className="fixed right-4 bottom-4 flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs hover:opacity-80" style={{ ...panelStyle, zIndex: feedbackLayer }} onClick={() => setOpen(true)}><Bug size={16} />反馈</button>}
            {marking && <>
                <div className="fixed inset-0 touch-none cursor-crosshair" style={{ zIndex: feedbackLayer + 20 }} onPointerDown={down} onPointerMove={event => { if (start.current) setRegion(rectangle(event.clientX, event.clientY)); }} onPointerUp={finish} onPointerCancel={cancel} onWheel={event => event.stopPropagation()}>
                    {region && <div className="pointer-events-none absolute border-2" style={{ left: region.x, top: region.y, width: region.width, height: region.height, borderColor: "#2f80ff", background: "rgba(47,128,255,.12)" }} />}
                </div>
                <div className="fixed top-3 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-xl border px-4 py-2 text-sm" style={{ ...panelStyle, zIndex: feedbackLayer + 21 }}>点选元素或拖动框选问题区域<Button type="text" icon={<X size={16} />} onClick={cancel}>取消</Button></div>
            </>}
            {highlight && shown && <>
                <div className="pointer-events-none fixed border-2 border-dashed" style={{ zIndex: feedbackLayer + 20, left: shown.x, top: shown.y, width: shown.width, height: shown.height, borderColor: "#2f80ff" }} />
                <div className="fixed top-3 left-1/2 max-w-[90vw] -translate-x-1/2 rounded-xl border px-4 py-2 text-xs" style={{ ...panelStyle, zIndex: feedbackLayer + 21 }}>
                    {highlight.title} · {highlightedNode ? "已定位节点" : `标注时视口 ${highlight.viewport.width}×${highlight.viewport.height}，区域按原位置显示`}
                    <Button type="text" onClick={() => { setHighlight(undefined); setOpen(true); }}>返回清单</Button>
                </div>
            </>}
            <Drawer title="Bug 清单" open={open} zIndex={feedbackLayer + 10} onClose={() => setOpen(false)} size={520}>
                <div className="mb-5 flex flex-wrap gap-2">
                    <Button type="primary" icon={<Scan size={16} />} onClick={begin}>标注问题</Button>
                    <Button icon={<Copy size={16} />} disabled={!store.reports.length} onClick={() => copyReports(store.reports)}>复制清单</Button>
                    <Button icon={<Download size={16} />} disabled={!store.reports.length} onClick={() => saveAs(new Blob([bugMarkdown(store.reports)], { type: "text/markdown;charset=utf-8" }), "canvas-bugs.md")}>导出</Button>
                </div>
                <p className="mb-4 text-xs opacity-65">标注后填写问题。复制清单到 Codex 对话即可继续排查，修复后由你验收关闭。</p>
                {store.error && <div role="alert" className="mb-3 text-sm">{store.error}<Button type="link" onClick={() => void store.load()}>重新读取</Button></div>}
                {store.busy && <p role="status">正在读写清单…</p>}
                {!store.busy && !store.reports.length && <Empty description="还没有标注的问题" />}
                <div className="space-y-4">{store.reports.map(report => <article key={report.id} className="rounded-xl border p-4" style={{ borderColor: theme.node.stroke }}>
                    <div className="mb-2 flex items-start justify-between gap-3"><strong>{report.title}</strong><Tag>{report.status}</Tag></div>
                    <div className="break-all text-[11px] opacity-60">{report.id}</div>
                    <p className="my-3 whitespace-pre-wrap text-sm">{report.actual}</p>
                    {report.expected && <p className="mb-2 whitespace-pre-wrap text-xs opacity-75">期望效果 · {report.expected}</p>}
                    <div className="flex gap-1"><Button type="text" onClick={() => setDraft({ ...report })}>查看／编辑</Button><Button type="text" onClick={() => locate(report)}>查看位置</Button><Button type="text" onClick={() => copyReports([report])}>复制此项</Button></div>
                </article>)}</div>
            </Drawer>
            <Modal title="问题标注" open={!!draft} zIndex={feedbackLayer + 30} onCancel={() => setDraft(undefined)} onOk={() => void save()} okText="保存问题" cancelText="取消" confirmLoading={store.busy} maskClosable={false}>
                {draft && <div className="space-y-3" data-canvas-shortcuts-ignore>
                    <div className="text-xs opacity-60">{draft.path} · {draft.label}{draft.nodeId && ` · 节点 ${draft.nodeId}`}</div>
                    {store.error && <p role="alert">{store.error}</p>}
                    <label className="block">问题标题<Input aria-label="问题标题" value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} placeholder="例如：生成中没有显示进度" /></label>
                    <label className="block">实际表现<Input.TextArea aria-label="实际表现" value={draft.actual} onChange={event => setDraft({ ...draft, actual: event.target.value })} autoSize={{ minRows: 2 }} /></label>
                    <label className="block">期望效果／验收条件<Input.TextArea aria-label="期望效果" value={draft.expected} onChange={event => setDraft({ ...draft, expected: event.target.value })} autoSize={{ minRows: 2 }} /></label>
                    <label className="block">复现步骤<Input.TextArea aria-label="复现步骤" value={draft.steps} onChange={event => setDraft({ ...draft, steps: event.target.value })} autoSize={{ minRows: 2 }} /></label>
                    <label className="block">状态<Select className="w-full" aria-label="Bug 状态" value={draft.status} options={bugStatuses.map(value => ({ value, label: value }))} onChange={status => setDraft({ ...draft, status })} /></label>
                    <label className="block">排查与修复记录<Input.TextArea aria-label="排查与修复记录" value={draft.resolution} onChange={event => setDraft({ ...draft, resolution: event.target.value })} autoSize={{ minRows: 2 }} /></label>
                </div>}
            </Modal>
        </div>,
        document.body,
    );
}
