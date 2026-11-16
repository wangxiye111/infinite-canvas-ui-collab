import { useEffect, useState } from "react";
import { Button, theme } from "antd";

import { localCliApi, localCliNames, localCliOutputUrl, type LocalCliEngine, type LocalCliJob } from "@/services/api/local-cli";

const jobLabels: Record<LocalCliJob["status"], string> = { submitting: "提交中", queued: "排队中", running: "执行中", saving: "正在保存结果", save_failed: "保存失败", query_failed: "查询暂时失败", succeeded: "已完成", failed: "失败", interrupted: "待核查", cancelled: "已取消" };

export function LocalCliJobs({ engine }: { engine?: LocalCliEngine }) {
    const { token } = theme.useToken();
    const [open, setOpen] = useState(false);
    const [jobs, setJobs] = useState<LocalCliJob[]>([]);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [actionId, setActionId] = useState("");
    const [texts, setTexts] = useState<Record<string, string>>({});
    const visibleJobs = jobs.filter((job) => !engine || job.provider === engine);

    const load = async () => {
        setLoading(true);
        try { setJobs(await localCliApi.jobs()); setError(""); }
        catch (cause) { setError(cause instanceof Error ? cause.message : "本地任务读取失败"); }
        finally { setLoading(false); }
    };
    useEffect(() => { if (open) void load(); }, [open, engine]);

    const inspect = async (job: LocalCliJob, action: "refresh" | "read" | "cancel") => {
        setActionId(job.id);
        try {
            if (action === "read") {
                setTexts((items) => ({ ...items, [job.id]: "正在读取…" }));
                const text = await localCliApi.readJobText(job);
                setTexts((items) => ({ ...items, [job.id]: text || "任务没有文本结果" }));
            } else {
                const result = action === "cancel" ? await localCliApi.cancelJob(job.id) : await localCliApi.refreshJob(job.id);
                setJobs((items) => items.map((item) => item.id === result.id ? result : item));
            }
            setError("");
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "任务状态待核查，请勿重复提交");
            if (action === "read") setTexts((items) => { const next = { ...items }; delete next[job.id]; return next; });
        } finally { setActionId(""); }
    };

    return <details className="mb-4 text-xs leading-5" onToggle={(event) => setOpen(event.currentTarget.open)}>
        <summary className="cursor-pointer" style={{ color: token.colorTextSecondary }}>本地任务 · 找回刷新前的结果</summary>
        <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between gap-2">
                <span style={{ color: token.colorTextSecondary }}>读取原任务，不会重新调用模型</span>
                <Button type="text" size="small" loading={loading} onClick={() => void load()}>刷新列表</Button>
            </div>
            {error ? <div role="alert">{error}</div> : null}
            {!loading && !visibleJobs.length ? <div style={{ color: token.colorTextSecondary }}>暂无本地任务</div> : null}
            {visibleJobs.map((job) => <div key={job.id} className="border-l pl-3" style={{ borderColor: token.colorBorderSecondary }}>
                <div>{!engine ? `${localCliNames[job.provider]} · ` : ""}{jobLabels[job.status]}</div>
                {job.prompt ? <div className="line-clamp-2">{job.prompt}</div> : null}
                <div className="break-all" style={{ color: token.colorTextSecondary }}>{job.id}{job.message ? ` · ${job.message}` : ""}</div>
                <div className="flex flex-wrap items-center gap-1">
                    <Button type="text" size="small" disabled={!!actionId} onClick={() => void inspect(job, "refresh")}>{job.status === "save_failed" ? "恢复保存" : job.status === "query_failed" ? "恢复查询" : "刷新状态"}</Button>
                    {job.outputs.some((output) => output.kind === "text") ? <Button type="text" size="small" disabled={!!actionId} onClick={() => void inspect(job, "read")}>读取结果</Button> : null}
                    {["submitting", "queued", "running"].includes(job.status) ? <Button type="text" size="small" disabled={!!actionId} onClick={() => void inspect(job, "cancel")}>停止任务</Button> : null}
                    {job.outputs.map((output) => {
                        let href: string;
                        try { href = localCliOutputUrl(output); } catch { return null; }
                        return <a key={output.id} href={href} download={output.name} className="px-2 underline underline-offset-4">下载{output.kind === "image" ? "图片" : "文本"}</a>;
                    })}
                </div>
                {texts[job.id] !== undefined ? <pre className="mt-2 whitespace-pre-wrap break-words font-sans">{texts[job.id]}</pre> : null}
            </div>)}
        </div>
    </details>;
}
