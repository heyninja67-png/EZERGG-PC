import http from "node:http";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { loadConfig } from "./config.js";
import { Store } from "./store.js";
import { createProvider, ProviderError } from "./provider.js";

const hash = value => createHash("sha256").update(value).digest("hex");
const equalText = (a, b) => {
  const left = Buffer.from(String(a)); const right = Buffer.from(String(b));
  return left.length === right.length && timingSafeEqual(left, right);
};
const json = (res, status, value) => {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  res.end(JSON.stringify(value));
};
async function readBody(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 32768) throw new ProviderError("Corpo da solicitação muito grande.", 413);
  }
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { throw new ProviderError("JSON inválido.", 400); }
}
function safeMachine(machine, config, provider) {
  const gpu = config.catalog.gpuProfiles[machine.gpuProfile];
  const os = config.catalog.operatingSystems.find(x => x.id === machine.os);
  return { ...machine, osLabel: os?.label || machine.os, gpuLabel: gpu?.label || machine.gpuProfile,
    connectionUrl: machine.providerId && provider.connectionUrl ? provider.connectionUrl(machine.providerId) : "", errorMessage: machine.errorMessage || "" };
}

export async function createApp({ config = loadConfig(), store = new Store(config.dataFile), provider = createProvider(config) } = {}) {
  await store.init();
  const pairAttempts = new Map();
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      if (req.method === "GET" && url.pathname === "/health") return json(res, 200, { status: "ok", provider: provider.info() });
      if (req.method === "GET" && url.pathname === "/api/catalog") {
        return json(res, 200, { ...config.catalog, gpuProfiles: Object.entries(config.catalog.gpuProfiles).map(([id, value]) => ({ id, label: value.label })), provider: provider.info() });
      }
      if (req.method === "POST" && url.pathname === "/api/pair") {
        const ip = req.socket.remoteAddress || "unknown";
        const attempt = pairAttempts.get(ip) || { count: 0, reset: Date.now() + 60000 };
        if (Date.now() > attempt.reset) { attempt.count = 0; attempt.reset = Date.now() + 60000; }
        attempt.count += 1; pairAttempts.set(ip, attempt);
        if (attempt.count > 10) return json(res, 429, { error: "Muitas tentativas. Aguarde um minuto." });
        const body = await readBody(req);
        if (!config.pairingCode || !equalText(body.pairingCode || "", config.pairingCode)) return json(res, 401, { error: "Código de pareamento inválido." });
        const token = randomBytes(32).toString("base64url");
        const device = { id: randomUUID(), tokenHash: hash(token), name: String(body.deviceName || "Android").slice(0, 80), createdAt: new Date().toISOString() };
        await store.mutate(state => { state.devices.push(device); });
        return json(res, 201, { token, deviceId: device.id, message: "Dispositivo pareado." });
      }

      const authorization = req.headers.authorization || "";
      const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
      if (!token) return json(res, 401, { error: "Dispositivo não pareado. Use o código de pareamento." });
      const tokenHash = hash(token);
      const device = store.snapshot().devices.find(item => item.tokenHash === tokenHash);
      if (!device) return json(res, 401, { error: "Token de dispositivo inválido ou revogado." });

      if (req.method === "GET" && url.pathname === "/api/machines") {
        const machines = store.snapshot().machines.filter(m => m.ownerDeviceId === device.id);
        return json(res, 200, { machines: await Promise.all(machines.map(async machine => {
          let current = machine;
          if (machine.providerId && provider.ready) {
            try {
              const state = await provider.getStatus(machine.providerId);
              if (state !== machine.state) {
                current = { ...machine, state, updatedAt: new Date().toISOString() };
                await store.mutate(draft => { const i = draft.machines.findIndex(x => x.id === machine.id); if (i >= 0) draft.machines[i] = current; });
              }
            } catch { /* mantém último estado confirmado */ }
          }
          return safeMachine(current, config, provider);
        })) });
      }

      if (req.method === "POST" && url.pathname === "/api/machines") {
        if (!provider.ready) throw new ProviderError(provider.info().message, 503);
        const body = await readBody(req);
        const os = config.catalog.operatingSystems.find(x => x.id === body.os);
        const cpu = Number(body.vCpu), ram = Number(body.ramGb), disk = Number(body.diskGb);
        const gpu = config.catalog.gpuProfiles[body.gpuProfile];
        const name = String(body.name || "").trim();
        if (!name || name.length > 48) throw new ProviderError("Nome do PC deve ter entre 1 e 48 caracteres.", 422);
        if (!os || !config.catalog.cpuCores.includes(cpu) || !config.catalog.ramGb.includes(ram) || !config.catalog.diskGb.includes(disk) || !gpu) {
          throw new ProviderError("Configuração solicitada não está no catálogo liberado pelo servidor.", 422);
        }
        const draftMachine = { id: randomUUID(), ownerDeviceId: device.id, name, os: os.id, osLabel: os.label, vCpu: cpu, ramGb: ram, diskGb: disk, gpuProfile: body.gpuProfile, providerId: "", state: "provisioning", errorMessage: "", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        await store.mutate(state => {
          if (gpu.hostpci && gpu.exclusive !== false) {
            const alreadyAllocated = state.machines.some(item => item.gpuProfile === body.gpuProfile && (item.state !== "error" || Boolean(item.providerId)));
            if (alreadyAllocated) throw new ProviderError("Esse perfil de GPU exclusiva já está reservado por outro Cloud PC.", 409);
          }
          state.machines.push(draftMachine);
        });
        setImmediate(async () => {
          try {
            const created = await provider.createMachine(draftMachine);
            await store.mutate(state => {
              const index = state.machines.findIndex(item => item.id === draftMachine.id);
              if (index >= 0) state.machines[index] = { ...state.machines[index], providerId: created.providerId, state: created.state || "starting", updatedAt: new Date().toISOString() };
            });
          } catch (error) {
            await store.mutate(state => {
              const index = state.machines.findIndex(item => item.id === draftMachine.id);
              if (index >= 0) state.machines[index] = { ...state.machines[index], providerId: error.providerId || state.machines[index].providerId, state: "error", errorMessage: String(error.message || "Falha no provisionamento").slice(0, 400), updatedAt: new Date().toISOString() };
            });
          }
        });
        return json(res, 202, { machine: safeMachine(draftMachine, config, provider), message: "Solicitação registrada; provisionamento em segundo plano." });
      }

      const match = url.pathname.match(/^\/api\/machines\/([0-9a-f-]+)(?:\/(start|stop))?$/i);
      if (match) {
        const [, id, action] = match;
        const machine = store.snapshot().machines.find(m => m.id === id && m.ownerDeviceId === device.id);
        if (!machine) return json(res, 404, { error: "Cloud PC não encontrado." });
        if (req.method === "GET" && !action) return json(res, 200, { machine: safeMachine(machine, config, provider) });
        if (req.method === "POST" && action) {
          if (!machine.providerId) throw new ProviderError("A VM ainda está sendo provisionada ou falhou; aguarde o resultado antes de enviar comandos.", 409);
          const state = action === "start" ? await provider.start(machine.providerId) : await provider.stop(machine.providerId);
          const updated = { ...machine, state, updatedAt: new Date().toISOString() };
          await store.mutate(draft => { const i = draft.machines.findIndex(x => x.id === id); if (i >= 0) draft.machines[i] = updated; });
          return json(res, 200, { machine: safeMachine(updated, config, provider) });
        }
        if (req.method === "DELETE" && !action) {
          if (machine.providerId) await provider.remove(machine.providerId);
          await store.mutate(draft => { draft.machines = draft.machines.filter(x => x.id !== id); });
          return json(res, 200, { deleted: true });
        }
      }
      return json(res, 404, { error: "Rota não encontrada." });
    } catch (error) {
      const status = error instanceof ProviderError ? error.status : 500;
      if (status >= 500) console.error("NEVOZ API:", error.message);
      return json(res, status, { error: status === 500 ? "Erro interno da NEVOZ API." : error.message });
    }
  });
  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const config = loadConfig();
  const app = await createApp({ config });
  app.listen(config.port, "0.0.0.0", () => console.log(`NEVOZ API ouvindo na porta ${config.port}; provider=${config.providerName}`));
}
