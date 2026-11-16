import { App, Alert, Button, Empty, Form, Input, Modal, Select, Spin, Tabs, Tag, theme } from "antd";
import { Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import {
    connectorsApi,
    connectorJobLabels,
    connectorProviderNames,
    canCancelConnectorJob,
    type ConnectorJob,
    type ConnectorPreset,
    type ConnectorProviderId,
} from "@/services/api/connectors";
import { useConnectorManagerStore, useConnectorsStore } from "@/stores/use-connectors-store";
import { ConnectorProviderCard } from "./connector-provider-card";
import { RunningHubPresetFields } from "./runninghub-preset-fields";
import { buildRunningHubParams, parseRunningHubParams, validateRunningHubParams, type RunningHubFields } from "@/lib/connectors/runninghub-preset";

const providerIds = Object.keys(connectorProviderNames) as ConnectorProviderId[];
const paramsHelp: Record<ConnectorProviderId, string> = {
    kling: '参数示例：{"options":{"aspect_ratio":"16:9"}}；模型 ID 请参照 CLI 的实际可用模型。图片角色为 image，尾帧为 tailImage。',
    jimeng: '参数使用 {"options":{...}}，填写官方 CLI 支持的ratio、resolution_type、video_resolution、duration、generate_num 等；图片角色为 image。',
    runninghub: "工作流/应用 ID 填入远端 ID。参数支持 nodeInfoList、promptTarget:{nodeId,fieldName}、inputTargets:[{role,nodeId,fieldName}]、outputKind；请按平台的真实节点填写。",
    tripo: '选择实际开通的模型版本。参数使用 {"options":{...}}，如 texture、pbr、face_limit；图生模型的图片角色为 image。',
    liblib: '远端 ID 填写 templateUuid。参数填写 generateParams、promptPath:[节点ID,"inputs","text"]、inputTargets:[{role,path:[节点ID,"inputs","image"]}] 和 outputKind。',
};

type PresetFields = Omit<ConnectorPreset, "id" | "params"> & { paramsText?: string; runninghub?: RunningHubFields };
function hasCredentials(value: unknown): boolean {
    if (!value || typeof value !== "object") return false;
    return Object.entries(value).some(([key, child]) => /^(api[_-]?key|access[_-]?key|secret([_-]?key)?|token|access[_-]?token|authorization|password|accessPassword)$/i.test(key) || hasCredentials(child));
}
function PresetsPanel() {
    const { token } = theme.useToken();
    const { message } = App.useApp();
    const [form] = Form.useForm<PresetFields>();
    const [editingId, setEditingId] = useState<string | null>(null);
    const [workflowMode, setWorkflowMode] = useState<"form" | "json">("form");
    const presets = useConnectorsStore((state) => state.presets);
    const providers = useConnectorsStore((state) => state.providers);
    const savePreset = useConnectorsStore((state) => state.savePreset);
    const removePreset = useConnectorsStore((state) => state.removePreset);
    const providerId = Form.useWatch("provider", form) as ConnectorProviderId | undefined;
    const actionId = Form.useWatch("action", form) as string | undefined;
    const provider = providers.find((item) => item.id === providerId);
    const action = provider?.actions.find((item) => item.id === actionId);
    const edit = (preset?: ConnectorPreset) => {
        form.resetFields();
        setEditingId(preset?.id || "");
        setWorkflowMode("form");
        form.setFieldValue("runninghub", parseRunningHubParams({}));
        if (preset) form.setFieldsValue({ ...preset, paramsText: JSON.stringify(preset.params || {}, null, 2) });
        if (preset?.provider === "runninghub") {
            try { form.setFieldValue("runninghub", parseRunningHubParams(preset.params)); }
            catch { setWorkflowMode("json"); message.info("此预设包含表单未支持的字段，已保留完整 JSON"); }
        }
    };
    const switchWorkflowMode = () => {
        try {
            if (workflowMode === "form") form.setFieldValue("paramsText", JSON.stringify(buildRunningHubParams(form.getFieldValue("runninghub")), null, 2));
            else form.setFieldValue("runninghub", parseRunningHubParams(JSON.parse(form.getFieldValue("paramsText") || "{}")));
            setWorkflowMode(workflowMode === "form" ? "json" : "form");
        } catch (error) { message.error(error instanceof Error ? error.message : "参数转换失败，原配置已保留"); }
    };
    const save = async () => {
        try {
            const values = await form.validateFields();
            let params: Record<string, unknown>;
            if (values.provider === "runninghub" && workflowMode === "form") params = buildRunningHubParams(values.runninghub || parseRunningHubParams({}));
            else try {
                const parsed: unknown = JSON.parse(values.paramsText?.trim() || "{}");
                if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
                params = parsed as Record<string, unknown>;
            } catch {
                message.error("业务参数必须是有效的 JSON 对象");
                return;
            }
            if (values.provider === "runninghub") validateRunningHubParams(params);
            if (hasCredentials(params)) {
                message.error("预设不能包含账户凭据，请在平台连接中配置");
                return;
            }
            savePreset({ id: editingId || crypto.randomUUID(), name: values.name.trim(), provider: values.provider, action: values.action, model: values.model?.trim() || undefined, remoteId: values.remoteId?.trim() || undefined, params });
            setEditingId(null);
            message.success("任务预设已保存");
        } catch (error) {
            if (error instanceof Error) message.error(error.message);
        }
    };
    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
                <p className="m-0 text-xs" style={{ color: token.colorTextSecondary }}>
                    保存常用生成配置，在画布直接选择。RunningHub 工作流由你添加，不预装未选定的工作流。
                </p>
                <Button type="text" icon={<Plus className="size-4" />} onClick={() => edit()}>
                    新建预设
                </Button>
            </div>
            {!presets.length && editingId === null && <Empty description="还没有任务预设，请先检查平台连接" />}
            {presets.map((preset) => (
                <div key={preset.id} className="flex items-center gap-3 border-b py-3" style={{ borderColor: token.colorBorderSecondary }}>
                    <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{preset.name}</div>
                        <div className="mt-1 text-xs" style={{ color: token.colorTextSecondary }}>
                            {connectorProviderNames[preset.provider]} · {providers.find((item) => item.id === preset.provider)?.actions.find((item) => item.id === preset.action)?.label || preset.action}
                            {preset.model ? ` · ${preset.model}` : ""}
                        </div>
                    </div>
                    <Button type="text" aria-label="编辑预设" icon={<Pencil className="size-4" />} onClick={() => edit(preset)} />
                    <Button type="text" danger aria-label="删除预设" icon={<Trash2 className="size-4" />} onClick={() => removePreset(preset.id)} />
                </div>
            ))}
            {editingId !== null && (
                <div className="rounded-xl border p-4" style={{ borderColor: token.colorBorderSecondary }}>
                    <Form form={form} layout="vertical" onFinish={() => void save()}>
                        <Form.Item name="name" label="预设名称" rules={[{ required: true, whitespace: true, message: "请填写名称" }]}>
                            <Input placeholder="例如：产品参考图生成" />
                        </Form.Item>
                        <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
                            <Form.Item name="provider" label="平台" rules={[{ required: true, message: "请选择平台" }]}>
                                <Select
                                    placeholder="选择平台"
                                    options={providerIds.map((id) => ({ value: id, label: connectorProviderNames[id], disabled: !providers.some((item) => item.id === id) }))}
                                    onChange={() => { setWorkflowMode("form"); form.setFieldsValue({ action: undefined, model: undefined, remoteId: undefined, paramsText: undefined, runninghub: parseRunningHubParams({}) }); }}
                                />
                            </Form.Item>
                            <Form.Item name="action" label="任务类型" rules={[{ required: true, message: "请选择任务类型" }]}>
                                <Select placeholder="选择任务类型" disabled={!provider} options={provider?.actions.map((item) => ({ value: item.id, label: item.label }))} onChange={() => form.setFieldsValue({ model: undefined, remoteId: undefined })} />
                            </Form.Item>
                        </div>
                        {providerId !== "runninghub" && <Form.Item name="model" label="模型 / 模型版本" rules={[{ required: Boolean(action?.requiresModel), whitespace: true, message: "请填写实际可用的模型 ID" }]}>
                            <Input placeholder="按平台文档或连接检查结果填写；不自动选择付费模型" />
                        </Form.Item>}
                        {action?.requiresRemoteId && (
                            <Form.Item name="remoteId" label="工作流 / AI 应用远端 ID" rules={[{ required: true, whitespace: true, message: "请填写远端 ID" }]}>
                                <Input placeholder="填写你实际拥有权限的工作流或应用 ID" />
                            </Form.Item>
                        )}
                        {providerId === "runninghub" && <div className="mb-3 flex items-center justify-between gap-3"><span className="text-sm font-medium">工作流配置</span><Button type="text" size="small" onClick={switchWorkflowMode}>{workflowMode === "form" ? "高级 JSON 编辑" : "切换为表单"}</Button></div>}
                        {providerId && (providerId !== "runninghub" || workflowMode === "json") && (
                            <p className="mb-3 text-xs leading-relaxed" style={{ color: token.colorTextSecondary }}>
                                {paramsHelp[providerId]}
                            </p>
                        )}
                        {providerId === "runninghub" && workflowMode === "form" ? <RunningHubPresetFields /> : <Form.Item name="paramsText" label="业务参数与输入映射（JSON，不含凭据）">
                            <Input.TextArea rows={6} placeholder="{}" spellCheck={false} />
                        </Form.Item>}
                        <div className="flex justify-end gap-1">
                            <Button type="text" onClick={() => setEditingId(null)}>
                                取消
                            </Button>
                            <Button type="text" htmlType="submit">
                                保存预设
                            </Button>
                        </div>
                    </Form>
                </div>
            )}
        </div>
    );
}

function JobsPanel() {
    const { token } = theme.useToken();
    const { message } = App.useApp();
    const jobs = useConnectorsStore((state) => state.jobs);
    const providers = useConnectorsStore((state) => state.providers);
    const setJob = useConnectorsStore((state) => state.setJob);
    const [busy, setBusy] = useState<string[]>([]);
    const update = async (job: ConnectorJob, cancel = false) => {
        setBusy((ids) => [...ids, job.id]);
        try {
            setJob(await (cancel ? connectorsApi.cancel(job.id) : connectorsApi.refresh(job.id)));
        } catch (error) {
            message.error(error instanceof Error ? error.message : "任务查询失败");
        } finally {
            setBusy((ids) => ids.filter((id) => id !== job.id));
        }
    };
    return (
        <div className="flex flex-col gap-3">
            <p className="m-0 text-xs" style={{ color: token.colorTextSecondary }}>
                刷新只查询已有任务，不会重新生成。结果回到原画布任务节点后可导入。
            </p>
            {!jobs.length && <Empty description="暂无平台任务" />}
            {jobs.map((job) => (
                <div key={job.id} className="border-b py-3" style={{ borderColor: token.colorBorderSecondary }}>
                    <div className="flex items-center gap-3">
                        <span className="min-w-0 flex-1 truncate font-medium">{job.preset.name}</span>
                        <Tag>{connectorJobLabels[job.status]}</Tag>
                        <Button type="text" loading={busy.includes(job.id)} disabled={busy.includes(job.id)} icon={<RefreshCw className="size-3.5" />} onClick={() => void update(job)}>
                            {job.status === "save_failed" ? "恢复保存" : job.status === "query_failed" ? "恢复查询" : "查询"}
                        </Button>
                        {canCancelConnectorJob(job) && providers.find((provider) => provider.id === job.provider)?.actions.find((action) => action.id === job.preset.action)?.canCancel && (
                            <Button type="text" disabled={busy.includes(job.id)} onClick={() => void update(job, true)}>
                                取消远端任务
                            </Button>
                        )}
                    </div>
                    <div className="mt-1 text-xs" style={{ color: token.colorTextSecondary }}>
                        {connectorProviderNames[job.provider]} · {job.remoteId ? `远端任务 ${job.remoteId}` : `本地任务 ${job.id}`} · {new Date(job.createdAt).toLocaleString()}
                    </div>
                    {job.message && <p className="mb-0 mt-2 break-words text-xs">{job.message}</p>}
                    {job.status === "save_failed" && <p className="mb-0 mt-2 text-xs">已保留 {job.outputs.length} 个本地结果。恢复保存只取回原任务的文件。</p>}
                    {job.status === "interrupted" && (
                        <p className="mb-0 mt-2 text-xs" style={{ color: token.colorWarningText }}>
                            提交中断，是否已计费需要在平台核查；不会自动重投。
                        </p>
                    )}
                </div>
            ))}
        </div>
    );
}

export function ConnectorManager({ open, onClose }: { open: boolean; onClose: () => void }) {
    const { token } = theme.useToken();
    const tab = useConnectorManagerStore((state) => state.tab);
    const setTab = useConnectorManagerStore((state) => state.setTab);
    const loading = useConnectorsStore((state) => state.loading);
    const error = useConnectorsStore((state) => state.error);
    const load = useConnectorsStore((state) => state.load);
    const readyCount = useConnectorsStore((state) => state.providers.filter(provider => provider.state === "ready").length);
    useEffect(() => {
        if (open) void load();
    }, [open, load]);
    return (
        <Modal open={open} onCancel={onClose} title="平台连接" width={960} footer={null} destroyOnHidden styles={{ body: { maxHeight: "75vh", overflow: "auto" } }}>
            <div className="mb-4 flex items-start justify-between gap-4">
                <p className="m-0 text-sm leading-6" style={{ color: token.colorTextSecondary }}>{readyCount ? `${readyCount} 个平台已就绪，可直接回到画布创作。` : "查看平台状态，连接后即可在画布中使用。"}</p>
                <Button type="text" aria-label="刷新平台状态" loading={loading} icon={<RefreshCw className="size-4" />} onClick={() => void load()} />
            </div>
            {error && <Alert type="warning" showIcon title={error} className="mb-4" />}
            <Spin spinning={loading}>
                <Tabs
                    activeKey={tab}
                    onChange={key => { if (key === "connections" || key === "presets" || key === "jobs") setTab(key); }}
                    items={[
                        {
                            key: "connections",
                            label: "平台连接",
                            children: (
                                <div className="space-y-6">
                                    <div>
                                        <h2 className="mb-3 mt-0 text-xs font-medium" style={{ color: token.colorTextSecondary }}>图片与视频</h2>
                                        <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
                                            {(["kling", "jimeng"] as const).map(id => <ConnectorProviderCard key={id} id={id} />)}
                                        </div>
                                    </div>
                                    <div>
                                        <h2 className="mb-3 mt-0 text-xs font-medium" style={{ color: token.colorTextSecondary }}>工作流与 AI 应用</h2>
                                        <ConnectorProviderCard id="runninghub" />
                                    </div>
                                    <details className="text-sm">
                                        <summary className="cursor-pointer">其他平台</summary>
                                        <div className="mt-3 grid grid-cols-1 items-start gap-4 md:grid-cols-2">{(["tripo", "liblib"] as const).map(id => <ConnectorProviderCard key={id} id={id} />)}</div>
                                    </details>
                                </div>
                            ),
                        },
                        { key: "presets", label: "任务预设", children: <PresetsPanel /> },
                        { key: "jobs", label: "任务记录", children: <JobsPanel /> },
                    ]}
                />
            </Spin>
        </Modal>
    );
}
