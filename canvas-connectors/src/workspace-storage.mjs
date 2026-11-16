import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, renameSync, readdirSync } from "node:fs";
import { join } from "node:path";

const namespaces = new Set(["canvas_state", "asset_state", "image_files", "media_files", "image_generation_logs", "video_generation_logs", "bug_reports"]);
export function createWorkspaceStorage(dataDir) {
  const root = join(dataDir, "workspace");
  function directory(namespace) {
    if (!namespaces.has(namespace)) throw Object.assign(new Error("未知项目存储"), { status: 400 });
    const path = join(root, namespace);
    mkdirSync(path, { recursive: true });
    return path;
  }
  function file(namespace, key) {
    if (typeof key !== "string" || !key) throw Object.assign(new Error("缺少记录标识"), { status: 400 });
    return join(directory(namespace), createHash("sha256").update(key).digest("hex") + ".json");
  }
  function read(path) {
    try { return JSON.parse(readFileSync(path, "utf8")); }
    catch (error) { if (error.code === "ENOENT") return null; throw error; }
  }
  return {
    list(namespace) {
      return readdirSync(directory(namespace)).filter(name => name.endsWith(".json")).map(name => {
        const record = read(join(directory(namespace), name));
        return { key: record.key, revision: record.revision, deleted: record.value === null };
      });
    },
    get(namespace, key) { return read(file(namespace, key)); },
    put(namespace, key, { value, revision }) {
      if (value !== null && typeof value !== "string") throw Object.assign(new Error("无效项目数据"), { status: 400 });
      const path = file(namespace, key), current = read(path);
      if ((current?.revision ?? null) !== revision) throw Object.assign(new Error("此记录已被另一个页面修改，未覆盖；请保留当前页面并刷新其他页面查看最新数据"), { status: 409 });
      const record = { key, value, revision: randomUUID() };
      const temporary = path + "." + record.revision + ".tmp";
      writeFileSync(temporary, JSON.stringify(record), { flag: "wx" });
      renameSync(temporary, path);
      return { revision: record.revision };
    },
  };
}
