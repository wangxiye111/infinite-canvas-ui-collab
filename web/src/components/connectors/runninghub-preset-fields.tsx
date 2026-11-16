import { Button, Form, Input, Select, theme } from "antd";
import { Plus, Trash2 } from "lucide-react";

const required = [{ required: true, whitespace: true, message: "请填写此项" }];

export function RunningHubPresetFields() {
    const { token } = theme.useToken();
    return <div className="space-y-4">
        <p className="text-xs leading-5" style={{ color: token.colorTextSecondary }}>在 RunningHub 工作流的 API 参数中查看节点 ID 和字段名称，再填写以下映射。保存仅创建本地配置，之后在画布连接素材并手动生成；不会自动运行。</p>
        <Form.Item name={["runninghub", "outputKind"]} label="结果类型" rules={[{ required: true }]}>
            <Select options={[{ value: "image", label: "图片" }, { value: "video", label: "视频" }, { value: "audio", label: "音频（现有能力）" }, { value: "model3d", label: "3D（现有能力）" }]} />
        </Form.Item>
        <div>
            <div className="mb-2 text-sm font-medium">提示词输入 <span className="font-normal" style={{ color: token.colorTextSecondary }}>可选</span></div>
            <div className="grid grid-cols-2 gap-3">
                <Form.Item name={["runninghub", "promptNodeId"]} label="节点 ID"><Input placeholder="例如 6" /></Form.Item>
                <Form.Item name={["runninghub", "promptFieldName"]} label="字段名称"><Input placeholder="例如 text" /></Form.Item>
            </div>
        </div>
        <div>
            <div className="mb-1 text-sm font-medium">参考素材输入</div>
            <p className="mb-3 text-xs" style={{ color: token.colorTextSecondary }}>为每个输入起一个角色名称，之后在画布为连入的素材选择该角色。</p>
            <Form.List name={["runninghub", "inputs"]}>{(fields, { add, remove }) => <div className="space-y-2">
                {fields.map(({ key, name }) => <div key={key} className="flex items-start gap-2">
                    <div className="grid flex-1 grid-cols-1 gap-x-3 sm:grid-cols-3">
                        <Form.Item name={[name, "role"]} label="角色名称" rules={required}><Input placeholder="例如 image / first_frame" /></Form.Item>
                        <Form.Item name={[name, "nodeId"]} label="节点 ID" rules={required}><Input placeholder="例如 12" /></Form.Item>
                        <Form.Item name={[name, "fieldName"]} label="字段名称" rules={required}><Input placeholder="例如 image" /></Form.Item>
                    </div>
                    <Button type="text" className="mt-7" aria-label="删除素材映射" icon={<Trash2 className="size-4" />} onClick={() => remove(name)} />
                </div>)}
                <Button type="text" icon={<Plus className="size-4" />} onClick={() => add({ role: "", nodeId: "", fieldName: "" })}>添加素材输入</Button>
            </div>}</Form.List>
        </div>
        <div>
            <div className="mb-1 text-sm font-medium">固定参数</div>
            <p className="mb-3 text-xs" style={{ color: token.colorTextSecondary }}>例如步数、种子或开关。未填写的字段沿用远端工作流设置。</p>
            <Form.List name={["runninghub", "parameters"]}>{(fields, { add, remove }) => <div className="space-y-2">
                {fields.map(({ key, name }) => <div key={key} className="flex items-start gap-2">
                    <div className="grid flex-1 grid-cols-2 gap-x-3">
                        <Form.Item name={[name, "nodeId"]} label="节点 ID" rules={required}><Input /></Form.Item>
                        <Form.Item name={[name, "fieldName"]} label="字段名称" rules={required}><Input /></Form.Item>
                        <Form.Item name={[name, "valueType"]} label="值类型" rules={[{ required: true }]}><Select options={[{ value: "text", label: "文本" }, { value: "number", label: "数字" }, { value: "boolean", label: "开关（true / false）" }, { value: "json", label: "JSON" }]} /></Form.Item>
                        <Form.Item name={[name, "value"]} label="参数值"><Input.TextArea autoSize={{ minRows: 1 }} placeholder="按所选类型填写" /></Form.Item>
                    </div>
                    <Button type="text" className="mt-7" aria-label="删除固定参数" icon={<Trash2 className="size-4" />} onClick={() => remove(name)} />
                </div>)}
                <Button type="text" icon={<Plus className="size-4" />} onClick={() => add({ nodeId: "", fieldName: "", valueType: "text", value: "" })}>添加固定参数</Button>
            </div>}</Form.List>
        </div>
    </div>;
}
