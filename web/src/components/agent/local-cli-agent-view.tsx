import { useEffect, useRef, useState } from "react";
import { App, Button, Checkbox, Input, Select } from "antd";
import { Check, Plus, RefreshCw, Send, Settings2, Square } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { summarizeCanvasAgentOps } from "@/lib/canvas/canvas-agent-ops";
import { randomId } from "@/lib/utils";
import { localCliApi, localCliNames, runLocalCli, type LocalCliProvider } from "@/services/api/local-cli";
import { useAgentStore } from "@/stores/use-agent-store";
import { useConfigStore } from "@/stores/use-config-store";
import { useLocalCliAgentStore, type LocalCliChatEngine, type LocalCliChatMessage } from "@/stores/use-local-cli-agent-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { AgentChatMessage } from "./agent-chat-message";
import { CLI_CANVAS_INSTRUCTIONS, cliCanvasSnapshot, parseCliCanvasReply, prepareCliCanvasOps } from "./local-cli-canvas";
import { LocalCliJobs } from "./local-cli-jobs";

const controllers = new Map<LocalCliChatEngine, AbortController>();

export function LocalCliAgentView() {
    const state = useLocalCliAgentStore();
    const engine = state.engine === "codex-cli" ? "gemini-cli" : state.engine;
    const theme = canvasThemes[useThemeStore((store) => store.theme)];
    const { message } = App.useApp();
    const projectId = useAgentStore((store) => store.canvasContext?.snapshot.projectId);
    const configOpen = useConfigStore((store) => store.isConfigOpen);
    const [includeCanvas, setIncludeCanvas] = useState(false);
    const [providers, setProviders] = useState<LocalCliProvider[]>([]);
    const [providerError, setProviderError] = useState("");
    const [checking, setChecking] = useState(false);
    const listRef = useRef<HTMLDivElement>(null);
    const threads = state.threads.filter((thread) => thread.engine === engine);
    const thread = threads.find((item) => item.id === state.activeThreads[engine]);
    const run = state.runs[engine];
    const provider = providers.find((item) => item.id === engine);
    const available = !providerError && provider?.actions.some((action) => action.id === "text");
    const disabled = !state.loaded || !!state.storageError || !!run;

    useEffect(() => { void state.load(); }, [state.load]);
    useEffect(() => { setIncludeCanvas(false); }, [projectId]);
    useEffect(() => {
        let current = true;
        if (state.engine !== "codex-cli" && !configOpen) void localCliApi.providers().then((items) => {
            if (current) { setProviders(items); setProviderError(""); }
        }).catch((error: unknown) => { if (current) setProviderError(error instanceof Error ? error.message : "无法读取本地 CLI 状态"); });
        return () => { current = false; };
    }, [state.engine, configOpen]);
    useEffect(() => {
        listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
    }, [thread?.messages.length, run?.jobId, state.engine]);

    const check = async () => {
        setChecking(true);
        try {
            const result = await localCliApi.check(engine);
            setProviders((items) => [...items.filter((item) => item.id !== engine), result]);
            setProviderError("");
        } catch (error) { setProviderError(error instanceof Error ? error.message : "检查失败"); }
        finally { setChecking(false); }
    };

    const send = async () => {
        const current = useLocalCliAgentStore.getState();
        const prompt = current.prompts[engine].trim();
        if (!prompt || disabled || !available || current.runs[engine]) return;
        const context = useAgentStore.getState().canvasContext;
        const snapshot = includeCanvas ? context?.snapshot : undefined;
        const threadId = current.activeThreads[engine] || current.newThread(engine);
        const history = current.threads.find((item) => item.id === threadId)?.messages || [];
        const turnId = randomId();
        const controller = new AbortController();
        controllers.set(engine, controller);
        current.setRun(engine, { threadId, turnId });
        current.setPrompt(engine, "");
        current.append(threadId, { threadId, turnId, itemId: randomId(), role: "user", text: prompt, projectId: snapshot?.projectId, projectTitle: snapshot?.title });
        try {
            const result = await runLocalCli({
                engine, action: "text", prompt, model: current.models[engine].trim() || undefined,
                messages: [
                    ...(snapshot ? [{ role: "system", content: CLI_CANVAS_INSTRUCTIONS }] : []),
                    ...history.filter((item) => item.role === "user" || item.role === "assistant").map((item) => ({ role: item.role, content: item.text })),
                ],
                mode: snapshot ? "canvas" : "chat", canvas: snapshot ? cliCanvasSnapshot(snapshot) : undefined,
            }, { signal: controller.signal, onJob: (job) => current.setRun(engine, { threadId, turnId, jobId: job.id }) });
            if (!result.text.trim()) throw new Error("CLI 未返回文字，请检查所选客户端或模型。");
            const parsed: ReturnType<typeof parseCliCanvasReply> = snapshot ? parseCliCanvasReply(result.text, snapshot) : { text: result.text };
            current.append(threadId, {
                threadId, turnId, itemId: randomId(), role: "assistant", text: parsed.text,
                projectId: snapshot?.projectId, projectTitle: snapshot?.title, ops: parsed.ops, proposalError: parsed.error,
            });
        } catch (error) {
            current.append(threadId, { threadId, turnId, itemId: randomId(), role: "error", text: error instanceof Error ? error.message : "CLI 调用失败" });
        } finally {
            controllers.delete(engine);
            current.setRun(engine);
        }
    };

    const apply = (item: LocalCliChatMessage) => {
        const context = useAgentStore.getState().canvasContext;
        if (!context || context.snapshot.projectId !== item.projectId) { message.warning("请先打开提案对应的原画布"); return; }
        if (item.applied) return;
        try {
            const ops = prepareCliCanvasOps(item.ops, context.snapshot);
            context.applyOps(ops);
            state.markApplied(item.threadId, item.itemId);
            message.success("已应用到画布，可使用画布撤销");
        } catch (error) { message.error(error instanceof Error ? error.message : "画布提案无法应用"); }
    };

    return (
        <div className={state.engine === "codex-cli" ? "hidden" : "flex min-h-0 flex-1 flex-col"} style={{ color: theme.node.text }}>
            <div className="space-y-2 px-4 py-3">
                <div className="flex items-center gap-1">
                    <Select className="min-w-0 flex-1" variant="borderless" aria-label="CLI 对话历史" placeholder="新对话" value={thread?.id} disabled={disabled} options={threads.map((item) => ({ value: item.id, label: item.title }))} onChange={(id) => state.selectThread(engine, id)} />
                    <Button type="text" aria-label="新建 CLI 对话" title="新建对话" icon={<Plus className="size-4" />} disabled={disabled} onClick={() => state.newThread(engine)} />
                    <Button type="text" aria-label="检查 CLI 状态" title="检查安装与登录状态" icon={<RefreshCw className="size-4" />} loading={checking} onClick={() => void check()} />
                    <Button type="text" aria-label="手动配置 CLI" title="手动配置 CLI" icon={<Settings2 className="size-4" />} onClick={() => useConfigStore.getState().openConfigDialog(false, "local-cli")} />
                </div>
                <div className="text-xs leading-5" style={{ color: theme.node.muted }}>
                    {providerError || provider?.message || "读取本地 CLI 状态…"}
                    {!available ? <button className="ml-1 underline underline-offset-4" onClick={() => useConfigStore.getState().openConfigDialog(false, "local-cli")}>打开连接配置</button> : null}
                </div>
                {state.storageError ? <div role="alert" className="text-xs leading-5">{state.storageError}</div> : null}
            </div>
            <div ref={listRef} className="thin-scrollbar relative min-h-0 flex-1 select-text overflow-y-auto">
                <LocalCliJobs engine={engine} />
                <div className="cue-agent-stream space-y-5">
                    {!thread?.messages.length && !run ? <div className="empty absolute inset-0 pointer-events-none"><div><b>今天想创作什么？</b>构思画面、分析图片或优化提示词。</div></div> : null}
                    {thread?.messages.map((item) => <div key={`${item.threadId}:${item.turnId}:${item.itemId}`}>
                        <AgentChatMessage item={{ id: item.itemId, role: item.role, text: item.text, title: item.role === "assistant" ? localCliNames[engine] : undefined }} theme={theme} />
                        {item.projectId && item.role === "user" ? <div className="mt-2 text-xs" style={{ color: theme.node.muted }}>已参考画布：{item.projectTitle || item.projectId}</div> : null}
                        {item.proposalError ? <div className="mt-2 text-xs leading-5" role="alert">提案未应用：{item.proposalError}</div> : null}
                        {item.ops?.length ? <div className="mt-3 space-y-2 border-l pl-3" style={{ borderColor: theme.node.stroke }}>
                            <div className="text-xs leading-5">{summarizeCanvasAgentOps(item.ops)} · {item.projectTitle || "来源画布"}</div>
                            <details className="text-xs" style={{ color: theme.node.muted }}>
                                <summary className="cursor-pointer">预览修改内容</summary>
                                <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all leading-5">{JSON.stringify(item.ops, null, 2)}</pre>
                            </details>
                            <Button type="text" size="small" disabled={item.applied || item.projectId !== projectId || !!state.storageError} icon={<Check className="size-3.5" />} onClick={() => apply(item)}>{item.applied ? "已应用" : item.projectId !== projectId ? "请打开原画布后应用" : "应用到画布"}</Button>
                        </div> : null}
                    </div>)}
                    {run ? <div role="status" className="text-xs leading-5" style={{ color: theme.node.muted }}>正在等待 {localCliNames[engine]}…{run.jobId ? <div className="break-all">任务：{run.jobId}</div> : null}</div> : null}
                </div>
            </div>
            <div className="comp cue-chat-composer space-y-2">
                <label className="flex items-center gap-2 text-xs" style={{ color: theme.node.muted }}>
                    <span className="shrink-0">模型</span>
                    <Input size="small" variant="borderless" aria-label="CLI 模型 ID" value={state.models[engine]} disabled={disabled} placeholder="留空使用当前 CLI 默认模型" onChange={(event) => state.setModel(engine, event.target.value)} />
                </label>
                <Checkbox checked={includeCanvas && !!projectId} disabled={!projectId || !!run} onChange={(event) => setIncludeCanvas(event.target.checked)}><span className="text-xs">参考当前画布，修改前由我确认</span></Checkbox>
                <Input.TextArea autoSize={{ minRows: 2 }} value={state.prompts[engine]} disabled={disabled} placeholder={available ? "输入问题，Enter 发送，Shift + Enter 换行" : "先在连接配置中设置并登录本地 CLI"} onChange={(event) => state.setPrompt(engine, event.target.value)} onPressEnter={(event) => {
                    if (!event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); }
                }} />
                <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] leading-4" style={{ color: theme.node.muted }}>调用使用所选 CLI 的账号与额度</span>
                    {run ? <Button type="text" className="send stop" aria-label="停止" icon={<Square className="size-3.5" />} onClick={() => controllers.get(engine)?.abort()} /> : <Button type="primary" className="send" aria-label="发送" icon={<Send className="size-3.5" />} disabled={disabled || !available || !state.prompts[engine].trim()} onClick={() => void send()} />}
                </div>
            </div>
        </div>
    );
}
