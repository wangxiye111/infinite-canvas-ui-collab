import { expect, test } from "bun:test";

import { validateGLB } from "../src/lib/connectors/model3d-validation";

function glb(json: object, binaryBytes = 0) {
    const encoded = new TextEncoder().encode(JSON.stringify(json));
    const jsonBytes = Math.ceil(encoded.length / 4) * 4;
    const data = new ArrayBuffer(20 + jsonBytes + (binaryBytes ? 8 + binaryBytes : 0));
    const view = new DataView(data);
    view.setUint32(0, 0x46546c67, true);
    view.setUint32(4, 2, true);
    view.setUint32(8, data.byteLength, true);
    view.setUint32(12, jsonBytes, true);
    view.setUint32(16, 0x4e4f534a, true);
    new Uint8Array(data, 20, jsonBytes).fill(32);
    new Uint8Array(data, 20, encoded.length).set(encoded);
    if (binaryBytes) {
        view.setUint32(20 + jsonBytes, binaryBytes, true);
        view.setUint32(24 + jsonBytes, 0x004e4942, true);
    }
    return data;
}

test("accepts a GLB with an embedded binary buffer", () => {
    const data = glb({ asset: { version: "2.0" }, buffers: [{ byteLength: 4 }], bufferViews: [{ buffer: 0, byteLength: 4 }] }, 4);
    expect(validateGLB(data).asset).toEqual({ version: "2.0" });
});

test("rejects HTML saved with a GLB extension and a mismatched container length", () => {
    expect(() => validateGLB(new TextEncoder().encode("<!doctype html><html>download failed</html>").buffer)).toThrow("GLB 2.0");
    const data = glb({ asset: { version: "2.0" } });
    new DataView(data).setUint32(8, data.byteLength - 4, true);
    expect(() => validateGLB(data)).toThrow("GLB 2.0");
});

test("rejects external buffers and extension texture URIs before they can be requested", () => {
    expect(() => validateGLB(glb({ asset: { version: "2.0" }, buffers: [{ byteLength: 4, uri: "https://example.com/model.bin" }] }))).toThrow("外部纹理");
    expect(() => validateGLB(glb({ asset: { version: "2.0" }, extensions: { texture: { uri: "../texture.png" } } }))).toThrow("外部纹理");
});

test("rejects buffer ranges outside embedded data", () => {
    expect(() => validateGLB(glb({ asset: { version: "2.0" }, buffers: [{ byteLength: 8 }] }, 4))).toThrow("GLB 2.0");
    expect(() => validateGLB(glb({ asset: { version: "2.0" }, buffers: [{ byteLength: 4 }], bufferViews: [{ buffer: 0, byteOffset: 2, byteLength: 4 }] }, 4))).toThrow("GLB 2.0");
});

test("rejects a truncated or unaligned chunk", () => {
    const data = glb({ asset: { version: "2.0" } });
    new DataView(data).setUint32(12, 5, true);
    expect(() => validateGLB(data)).toThrow("GLB 2.0");
});
