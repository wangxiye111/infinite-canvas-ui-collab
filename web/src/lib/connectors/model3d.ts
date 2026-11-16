import { uploadMediaFile } from "@/services/file-storage";
import type { CanvasNodeMetadata } from "@/types/canvas";
import { validateGLB } from "./model3d-validation";

export async function importGLB(file: File): Promise<CanvasNodeMetadata> {
    const data = await file.arrayBuffer();
    validateGLB(data);
    const media = await uploadMediaFile(new Blob([data], { type: "model/gltf-binary" }), "model3d");
    return { content: media.url, storageKey: media.storageKey, bytes: media.bytes, mimeType: media.mimeType, model3d: { fileName: file.name }, interactive: false };
}
