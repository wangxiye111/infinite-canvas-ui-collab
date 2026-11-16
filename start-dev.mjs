import { homedir } from "node:os";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "./web/node_modules/vite/dist/node/index.js";
import { createConnectorServer } from "./canvas-connectors/src/server.mjs";
import { ensureDevelopmentAgent } from "./start-dev-agent.mjs";

// Preview source changes without replacing the existing packaged app on port 3000.
const root = dirname(fileURLToPath(import.meta.url));
const agent = await ensureDevelopmentAgent({ root });
console.log(`本机对话服务：${agent.reused ? '复用已运行服务' : '已启动'}`);
let connectors;
try {
    connectors = await createConnectorServer({
        dataDir: resolve(homedir(), ".infinite-canvas/connectors-development"),
        distDir: resolve(root, "web/dist"),
    });
    await new Promise((accept, reject) => {
        connectors.server.once("error", reject);
        connectors.server.listen(0, "127.0.0.1", accept);
    });
    const web = await createServer({
        root: resolve(root, "web"),
        configFile: resolve(root, "web/vite.config.ts"),
        server: {
            host: "127.0.0.1", port: 5173, strictPort: true,
            // Retain the browser's Host and Origin so the connector's same-origin check remains effective.
            proxy: { "/api/connectors": { target: `http://127.0.0.1:${connectors.server.address().port}` } },
        },
    });
    await web.listen();
    console.log("开发测试页：http://127.0.0.1:5173/ （项目、平台配置与 3000 版本分别保存）");
    for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { void Promise.all([web.close(), connectors.close(), agent.close()]).then(() => process.exit(0)); });
} catch (error) {
    await connectors?.close();
    await agent.close();
    throw error;
}
