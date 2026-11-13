import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export class Store {
  constructor(path) { this.path = path; this.state = { devices: [], machines: [] }; this.queue = Promise.resolve(); }
  async init() {
    await mkdir(dirname(this.path), { recursive: true });
    try {
      const parsed = JSON.parse(await readFile(this.path, "utf8"));
      this.state = { devices: Array.isArray(parsed.devices) ? parsed.devices : [], machines: Array.isArray(parsed.machines) ? parsed.machines : [] };
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      await this.#flush();
    }
    return this;
  }
  snapshot() { return structuredClone(this.state); }
  async mutate(fn) {
    const run = this.queue.then(async () => {
      const draft = structuredClone(this.state);
      const result = await fn(draft);
      this.state = draft;
      await this.#flush();
      return result;
    });
    this.queue = run.catch(() => {});
    return run;
  }
  async #flush() {
    const temp = `${this.path}.tmp`;
    await writeFile(temp, JSON.stringify(this.state, null, 2), { mode: 0o600 });
    await rename(temp, this.path);
  }
}
