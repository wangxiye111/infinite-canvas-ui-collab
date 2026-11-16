import { homedir } from "node:os";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createConnectorServer } from "./server.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const port = Number(process.env.CANVAS_CONNECTORS_PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("无效的本地端口");
const app = await createConnectorServer({
  dataDir:
    process.env.CANVAS_CONNECTORS_HOME ||
    resolve(homedir(), ".infinite-canvas/connectors"),
  distDir: process.env.CANVAS_CONNECTORS_DIST || resolve(root, "web/dist"),
});
app.server.listen(port, "127.0.0.1", () =>
  console.log(`画布与平台连接服务：http://127.0.0.1:${port}`),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    void app.close().then(() => process.exit(0));
  });
