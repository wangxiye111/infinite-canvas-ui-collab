import { Box3, DirectionalLight, HemisphereLight, LoadingManager, Material, Mesh, Object3D, PerspectiveCamera, Scene, Skeleton, SkinnedMesh, Texture, Vector3, WebGLRenderer } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

export type Model3DViewer = { capture: () => Promise<Blob>; dispose: () => void };

function disposeModels(roots: Object3D[]) {
    const geometries = new Set<Mesh["geometry"]>();
    const materials = new Set<Material>();
    const textures = new Set<Texture>();
    const skeletons = new Set<Skeleton>();
    roots.forEach((root) =>
        root.traverse((object) => {
            const mesh = object as Mesh;
            if (mesh.geometry) geometries.add(mesh.geometry);
            if (mesh.material) (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((material) => materials.add(material));
            if (object instanceof SkinnedMesh) skeletons.add(object.skeleton);
        }),
    );
    materials.forEach((material) =>
        Object.values(material).forEach((value) => {
            if (value instanceof Texture) textures.add(value);
        }),
    );
    textures.forEach((texture) => {
        const data = texture.source.data;
        if (typeof ImageBitmap !== "undefined" && data instanceof ImageBitmap) data.close();
        texture.dispose();
    });
    materials.forEach((material) => material.dispose());
    geometries.forEach((geometry) => geometry.dispose());
    skeletons.forEach((skeleton) => skeleton.dispose());
}

export async function createModel3DViewer(host: HTMLElement, data: ArrayBuffer, signal: AbortSignal): Promise<Model3DViewer> {
    signal.throwIfAborted();
    const manager = new LoadingManager();
    manager.setURLModifier((url) => {
        if (!url.startsWith("blob:") && !url.startsWith("data:")) throw new Error("GLB 含外部资源，请先将纹理和缓冲文件内嵌");
        return url;
    });
    const gltf = await new GLTFLoader(manager).parseAsync(data, "");
    if (signal.aborted) {
        disposeModels(gltf.scenes);
        signal.throwIfAborted();
    }
    let renderer: WebGLRenderer | undefined;
    let controls: OrbitControls | undefined;
    let observer: ResizeObserver | undefined;
    let disposed = false;
    const dispose = () => {
        if (disposed) return;
        disposed = true;
        signal.removeEventListener("abort", dispose);
        observer?.disconnect();
        controls?.dispose();
        disposeModels(gltf.scenes);
        renderer?.dispose();
        renderer?.forceContextLoss();
        renderer?.domElement.remove();
    };
    try {
        const scene = new Scene();
        scene.add(gltf.scene, new HemisphereLight(0xffffff, 0x888888, 2));
        const light = new DirectionalLight(0xffffff, 3);
        light.position.set(3, 5, 4);
        scene.add(light);
        const bounds = new Box3().setFromObject(gltf.scene);
        const size = bounds.getSize(new Vector3());
        const radius = size.length() / 2;
        if (!Number.isFinite(radius) || radius <= 0) throw new Error("GLB 没有可预览的模型几何体");
        const center = bounds.getCenter(new Vector3());
        const width = host.clientWidth || 420;
        const height = host.clientHeight || 320;
        const camera = new PerspectiveCamera(40, width / height, radius / 100, radius * 100);
        const halfFov = Math.atan(Math.tan((camera.fov * Math.PI) / 360) * Math.min(camera.aspect, 1));
        camera.position.copy(center).add(new Vector3(1, 0.65, 1).normalize().multiplyScalar((radius / Math.sin(halfFov)) * 1.15));
        renderer = new WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(width, height, false);
        renderer.domElement.style.cssText = "width:100%;height:100%;display:block;touch-action:none";
        host.appendChild(renderer.domElement);
        controls = new OrbitControls(camera, renderer.domElement);
        controls.target.copy(center);
        controls.update();
        const render = () => {
            if (!disposed) renderer!.render(scene, camera);
        };
        controls.addEventListener("change", render);
        observer = new ResizeObserver(() => {
            if (disposed || !host.clientWidth || !host.clientHeight) return;
            camera.aspect = host.clientWidth / host.clientHeight;
            camera.updateProjectionMatrix();
            renderer!.setSize(host.clientWidth, host.clientHeight, false);
            render();
        });
        observer.observe(host);
        signal.addEventListener("abort", dispose, { once: true });
        render();
        return {
            dispose,
            capture: () =>
                new Promise((resolve, reject) => {
                    if (disposed) return reject(new Error("模型预览已关闭"));
                    // Render immediately before reading the drawing buffer; no persistent buffer or idle frame is needed.
                    render();
                    renderer!.domElement.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("当前视角截图失败"))), "image/png");
                }),
        };
    } catch (error) {
        dispose();
        throw error;
    }
}
