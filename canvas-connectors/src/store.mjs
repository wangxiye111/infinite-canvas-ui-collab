import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  chmodSync,
  existsSync,
} from "node:fs";
import { open, stat, realpath } from "node:fs/promises";
import { join, basename, relative, isAbsolute } from "node:path";
import { randomUUID } from "node:crypto";

export const secretKey =
  /^(?:api[-_]?key|access[-_]?key|secret(?:[-_]?key)?|authorization|access[-_]?token|refresh[-_]?token|token|password|accessPassword)$/i;
export function redact(value, secrets = []) {
  if (typeof value === "string") {
    let text = value;
    for (const secret of secrets)
      if (secret) text = text.split(secret).join("[已隐藏]");
    return text.replace(
      /((?:api[_-]?key|secret[_-]?key|access[_-]?token|refresh[_-]?token|authorization)\s*[:=]\s*)([^\s,;"'}]+)/gi,
      "$1[已隐藏]",
    );
  }
  if (Array.isArray(value)) return value.map((item) => redact(item, secrets));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        secretKey.test(key) ? "[已隐藏]" : redact(item, secrets),
      ]),
    );
  return value;
}

export function createStore(dataDir) {
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  chmodSync(dataDir, 0o700);
  const filesDir = join(dataDir, "files");
  mkdirSync(filesDir, { recursive: true, mode: 0o700 });
  const read = (name) => {
    const path = join(dataDir, `${name}.json`);
    return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
  };
  const write = (name, data) => {
    const target = join(dataDir, `${name}.json`),
      temp = `${target}.${randomUUID()}.tmp`;
    writeFileSync(temp, JSON.stringify(data, null, 2), { mode: 0o600 });
    renameSync(temp, target);
    chmodSync(target, 0o600);
  };
  const store = {
    dataDir,
    configs: read("connections"),
    jobs: read("jobs"),
    files: read("files"),
    saveConfigs() {
      write("connections", this.configs);
    },
    saveJobs() {
      write("jobs", this.jobs);
    },
    secrets() {
      return Object.values(this.configs).flatMap((config) =>
        Object.entries(config)
          .filter(([key]) => secretKey.test(key))
          .map(([, value]) => String(value))
          .filter(Boolean),
      );
    },
    public(value) {
      return redact(value, this.secrets());
    },
    getFile(id) {
      if (typeof id !== "string" || !Object.hasOwn(this.files, id))
        throw Object.assign(new Error("素材不存在"), { status: 404 });
      return { ...this.files[id], path: join(filesDir, id) };
    },
    async saveFile(
      stream,
      { name = "asset", mimeType = "application/octet-stream" } = {},
    ) {
      const id = randomUUID();
      const path = join(filesDir, id);
      const file = await open(path, "wx", 0o600);
      let bytes = 0;
      try {
        for await (const chunk of stream) {
          const data = Buffer.from(chunk);
          await file.writeFile(data);
          bytes += data.length;
        }
      } finally {
        await file.close();
      }
      const item = {
        id,
        name: basename(String(name)).replace(/[\r\n]/g, "_") || "asset",
        mimeType: String(mimeType).split(";")[0],
        bytes,
      };
      this.files[id] = item;
      write("files", this.files);
      return item;
    },
    async importCliFile(path, jobId, options = {}) {
      const allowed = await realpath(join(dataDir, "cli-results", jobId));
      const actual = await realpath(path);
      const child = relative(allowed, actual);
      if (!child || child.startsWith("..") || isAbsolute(child))
        throw new Error("平台输出不在当前任务的下载目录内");
      const info = await stat(actual);
      if (!info.isFile()) throw new Error("平台输出不是文件");
      const handle = await open(actual, "r");
      try {
        return await this.saveFile(handle.createReadStream(), {
          name: options.name || basename(actual),
          mimeType: options.mimeType || mimeForName(actual),
        });
      } finally {
        await handle.close().catch(() => {});
      }
    },
  };
  return store;
}

export function mimeForName(name) {
  const ext = String(name).split(".").pop().toLowerCase();
  if (ext === "txt") return "text/plain";
  return (
    {
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      webp: "image/webp",
      gif: "image/gif",
      mp4: "video/mp4",
      webm: "video/webm",
      mp3: "audio/mpeg",
      wav: "audio/wav",
      glb: "model/gltf-binary",
      gltf: "model/gltf+json",
      html: "text/html",
      js: "text/javascript",
      css: "text/css",
      json: "application/json",
      svg: "image/svg+xml",
      ico: "image/x-icon",
      woff2: "font/woff2",
    }[ext] || "application/octet-stream"
  );
}
