// Validate the GLB container before persisting it or allowing GLTFLoader to resolve resources.
export function validateGLB(data: ArrayBuffer) {
    const invalid = () => new Error("文件不是有效的 GLB 2.0 模型");
    if (data.byteLength < 20) throw invalid();
    const view = new DataView(data);
    if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== data.byteLength) throw invalid();
    let json: Record<string, unknown> | undefined;
    let binaryLength = 0;
    let hasBinary = false;
    for (let offset = 12; offset < data.byteLength; ) {
        if (offset + 8 > data.byteLength) throw invalid();
        const length = view.getUint32(offset, true);
        const type = view.getUint32(offset + 4, true);
        if (length % 4 || offset + 8 + length > data.byteLength) throw invalid();
        if (offset === 12 && type !== 0x4e4f534a) throw invalid();
        if (type === 0x4e4f534a) {
            if (json || offset !== 12) throw invalid();
            try {
                const parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(data, offset + 8, length)));
                if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw invalid();
                json = parsed;
            } catch {
                throw invalid();
            }
        }
        if (type === 0x004e4942) {
            if (hasBinary) throw invalid();
            hasBinary = true;
            binaryLength = length;
        }
        offset += 8 + length;
    }
    if (!json || (json.asset as { version?: string } | undefined)?.version !== "2.0") throw invalid();
    const checkResources = (value: unknown) => {
        if (!value || typeof value !== "object") return;
        for (const [key, child] of Object.entries(value)) {
            if (key === "uri" && (typeof child !== "string" || !child.startsWith("data:"))) throw new Error("请导入资源已内嵌的 GLB；暂不支持外部纹理或缓冲文件");
            checkResources(child);
        }
    };
    checkResources(json);
    if (json.buffers !== undefined && !Array.isArray(json.buffers)) throw invalid();
    const buffers = (json.buffers || []) as { byteLength?: number; uri?: string }[];
    buffers.forEach((buffer, index) => {
        if (!buffer || !Number.isInteger(buffer.byteLength) || buffer.byteLength! < 0) throw invalid();
        if (!buffer.uri && (index !== 0 || !hasBinary || buffer.byteLength! > binaryLength || binaryLength - buffer.byteLength! > 3)) throw invalid();
    });
    if (json.bufferViews !== undefined && !Array.isArray(json.bufferViews)) throw invalid();
    for (const item of (json.bufferViews || []) as { buffer: number; byteOffset?: number; byteLength: number }[]) {
        if (
            !item ||
            !Number.isInteger(item.buffer) ||
            !buffers[item.buffer] ||
            !Number.isInteger(item.byteOffset ?? 0) ||
            (item.byteOffset ?? 0) < 0 ||
            !Number.isInteger(item.byteLength) ||
            item.byteLength < 0 ||
            (item.byteOffset ?? 0) + item.byteLength > buffers[item.buffer].byteLength!
        )
            throw invalid();
    }
    return json;
}
