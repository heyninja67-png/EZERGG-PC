import http from "node:http";
import net from "node:net";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { loadConfig } from "./config.js";
import { Store } from "./store.js";
import { createProvider, ProviderError } from "./provider.js";

const hash = value => createHash("sha256").update(value).digest("hex");
const equalHash = (a, b) => {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && timingSafeEqual(left, right);
};
const json = (res, status, value) => {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer"
  });
  res.end(JSON.stringify(value));
};

async function readBody(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 32768) throw new ProviderError("Corpo da solicitação muito grande.", 413);
  }
  if (!raw) return {};
  try { return JSON.parse(raw); }
  catch { throw new ProviderError("JSON inválido.", 400); }
}

const consoleEnabled = (config, provider) => {
  if (!config.publicBaseUrl || !config.consoleSecret || typeof provider.consoleTarget !== "function") return false;
  try { return new URL(config.publicBaseUrl).protocol === "https:"; }
  catch { return false; }
};

function createConsoleTicket(config, machine, device) {
  const payload = Buffer.from(JSON.stringify({ machineId: machine.id, deviceId: device.id, expiresAt: Date.now() + 180000 })).toString("base64url");
  const signature = createHmac("sha256", config.consoleSecret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function verifyConsoleTicket(ticket, config) {
  if (!config.consoleSecret || typeof ticket !== "string") return null;
  const [payload, signature, extra] = ticket.split(".");
  if (!payload || !signature || extra) return null;
  const expected = createHmac("sha256", config.consoleSecret).update(payload).digest("base64url");
  if (!equalHash(signature, expected)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!parsed.machineId || !parsed.deviceId || !Number.isFinite(parsed.expiresAt) || parsed.expiresAt < Date.now()) return null;
    return parsed;
  } catch { return null; }
}

function safeMachine(machine, config, provider) {
  const gpu = config.catalog.gpuProfiles[machine.gpuProfile];
  const os = config.catalog.operatingSystems.find(item => item.id === machine.os);
  return {
    ...machine,
    osLabel: os?.label || machine.os,
    gpuLabel: gpu?.label || machine.gpuProfile,
    connectionAvailable: consoleEnabled(config, provider) && Boolean(machine.providerId),
    errorMessage: machine.errorMessage || ""
  };
}

function websocketFrame(data, opcode = 2) {
  const payload = Buffer.isBuffer(data) ? data : Buffer.from(data);
  let header;
  if (payload.length < 126) {
    header = Buffer.from([0x80 | opcode, payload.length]);
  } else if (payload.length <= 0xffff) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(payload.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(payload.length), 2);
  }
  return Buffer.concat([header, payload]);
}

function consumeWebsocketFrames(buffer, socket, onPayload, onClose) {
  let offset = 0;
  while (buffer.length - offset >= 2) {
    const first = buffer[offset];
    const second = buffer[offset + 1];
    const opcode = first & 0x0f;
    const masked = (second & 0x80) !== 0;
    let length = second & 0x7f;
    let cursor = offset + 2;
    if (length === 126) {
      if (buffer.length - cursor < 2) break;
      length = buffer.readUInt16BE(cursor);
      cursor += 2;
    } else if (length === 127) {
      if (buffer.length - cursor < 8) break;
      const largeLength = buffer.readBigUInt64BE(cursor);
      if (largeLength > 16n * 1024n * 1024n) { socket.destroy(); return Buffer.alloc(0); }
      length = Number(largeLength);
      cursor += 8;
    }
    if (!masked || length > 16 * 1024 * 1024) { socket.destroy(); return Buffer.alloc(0); }
    if (buffer.length - cursor < 4 + length) break;
    const mask = buffer.subarray(cursor, cursor + 4);
    cursor += 4;
    const payload = Buffer.from(buffer.subarray(cursor, cursor + length));
    for (let index = 0; index < payload.length; index++) payload[index] ^= mask[index % 4];
    offset = cursor + length;

    if (opcode === 0x8) { onClose(); return buffer.subarray(offset); }
    if (opcode === 0x9) socket.write(websocketFrame(payload, 0xA));
    else if (opcode === 0x2 || opcode === 0x0 || opcode === 0x1) onPayload(payload);
  }
  return buffer.subarray(offset);
}

function consoleHtml(ticket, nonce) {
  const encodedTicket = JSON.stringify(ticket);
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><meta name="theme-color" content="#05080b"><title>NEVOZ Desktop</title>
<style>
*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#05080b;color:#effcff;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif}header{height:48px;display:flex;align-items:center;gap:10px;padding:0 13px;background:#0b151b;border-bottom:1px solid #173845}header b{font-size:12px;letter-spacing:1.3px}header span{font-size:10px;color:#16d9f5;margin-left:auto}#screen{position:absolute;inset:48px 0 0;background:#000;display:flex;align-items:center;justify-content:center}#state{position:absolute;z-index:3;color:#8aefff;font-size:13px;text-align:center;padding:20px}.noVNC_canvas{width:100%!important;height:100%!important;object-fit:contain;touch-action:pan-x pan-y}
</style></head><body><header><b>NEVOZ SETUP</b><span id="statebar">CONECTANDO AO WINDOWS…</span></header><div id="screen"><div id="state">Estabelecendo conexão segura…</div></div>
<script type="module" nonce="${nonce}">
import RFB from '/console/vendor/core/rfb.js';
const ticket=${encodedTicket};
const screen=document.getElementById('screen');
const state=document.getElementById('state');
const bar=document.getElementById('statebar');
const protocol=location.protocol==='https:'?'wss:':'ws:';
try{
 const rfb=new RFB(screen, protocol+'//'+location.host+'/console/ws?ticket='+encodeURIComponent(ticket));
 rfb.scaleViewport=true; rfb.resizeSession=true; rfb.showDotCursor=true;
 rfb.addEventListener('connect',()=>{state.remove();bar.textContent='CONECTADO';});
 rfb.addEventListener('disconnect',event=>{bar.textContent='DESCONECTADO';state.textContent=event.detail?.clean?'Conexão encerrada.':'A conexão foi interrompida. Volte ao NEVOZ e tente novamente.';state.style.display='block';});
 rfb.addEventListener('credentialsrequired',()=>{bar.textContent='AUTENTICAÇÃO DO CONSOLE NECESSÁRIA';});
 document.addEventListener('visibilitychange',()=>{if(document.hidden){} });
 window.addEventListener('pagehide',()=>rfb.disconnect());
}catch(error){state.textContent='Falha ao abrir a área de trabalho: '+error.message;bar.textContent='ERRO';}
</script></body></html>`;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const noVncRoot = path.resolve(here, "../node_modules/@novnc/novnc");
const mimeTypes = { ".js": "text/javascript; charset=utf-8", ".json": "application/json", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".woff": "font/woff", ".woff2": "font/woff2" };

async function serveNoVncAsset(req, res, pathname) {
  const relative = decodeURIComponent(pathname.slice("/console/vendor/".length));
  const target = path.resolve(noVncRoot, relative);
  if (!target.startsWith(noVncRoot + path.sep)) return json(res, 400, { error: "Caminho inválido." });
  try {
    const data = await readFile(target);
    res.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(target)] || "application/octet-stream",
      "Cache-Control": "public, max-age=86400",
      "X-Content-Type-Options": "nosniff"
    });
    res.end(data);
  } catch {
    return json(res, 503, { error: "Biblioteca noVNC não instalada. Execute npm install no provedor." });
  }
}

async function handleConsoleUpgrade(req, socket, head, config, store, provider) {
  const requestUrl = new URL(req.url, "http://127.0.0.1");
  if (requestUrl.pathname !== "/console/ws") { socket.destroy(); return; }
  const ticketData = verifyConsoleTicket(requestUrl.searchParams.get("ticket"), config);
  if (!ticketData) { socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n"); socket.destroy(); return; }
  const machine = store.snapshot().machines.find(item => item.id === ticketData.machineId && item.ownerDeviceId === ticketData.deviceId);
  if (!machine || machine.state !== "running" || !machine.providerId) {
    socket.write("HTTP/1.1 409 Conflict\r\nConnection: close\r\n\r\n"); socket.destroy(); return;
  }
  if (req.headers.origin) {
    try {
      if (new URL(req.headers.origin).host !== req.headers.host) { socket.destroy(); return; }
    } catch { socket.destroy(); return; }
  }
  const key = req.headers["sec-websocket-key"];
  if (!key || req.headers["sec-websocket-version"] !== "13") { socket.destroy(); return; }
  const target = await provider.consoleTarget(machine.providerId);
  const accept = createHash("sha1").update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest("base64");
  const requestedProtocol = String(req.headers["sec-websocket-protocol"] || "").split(",").map(value => value.trim()).filter(Boolean)[0];
  socket.write([
    "HTTP/1.1 101 Switching Protocols",
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Accept: ${accept}`,
    ...(requestedProtocol ? [`Sec-WebSocket-Protocol: ${requestedProtocol}`] : []),
    "\r\n"
  ].join("\r\n"));
  socket.setNoDelay(true);

  const vnc = net.createConnection({ host: target.host, port: target.port });
  let pending = Buffer.alloc(0);
  let ended = false;
  const close = () => {
    if (ended) return;
    ended = true;
    vnc.destroy();
    socket.destroy();
  };
  socket.on("data", chunk => {
    pending = Buffer.concat([pending, chunk]);
    pending = consumeWebsocketFrames(pending, socket, payload => {
      if (!vnc.write(payload)) socket.pause();
    }, close);
  });
  vnc.on("drain", () => socket.resume());
  vnc.on("data", chunk => {
    if (!socket.write(websocketFrame(chunk, 0x2))) vnc.pause();
  });
  socket.on("drain", () => vnc.resume());
  socket.on("close", close);
  socket.on("error", close);
  vnc.on("error", () => {
    if (!ended && !socket.destroyed) socket.write(websocketFrame(Buffer.from([0x03, 0xF3]), 0x8));
    close();
  });
  vnc.on("close", () => {
    if (!ended && !socket.destroyed) socket.end(websocketFrame(Buffer.from([0x03, 0xE8]), 0x8));
    close();
  });
  if (head?.length) {
    pending = Buffer.concat([pending, head]);
    pending = consumeWebsocketFrames(pending, socket, payload => { if (!vnc.write(payload)) socket.pause(); }, close);
  }
}

export async function createApp({ config = loadConfig(), store = new Store(config.dataFile), provider = createProvider(config) } = {}) {
  await store.init();
  const bootstrapAttempts = new Map();

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://127.0.0.1");
      if (req.method === "GET" && url.pathname === "/health") {
        return json(res, 200, { status: "ok", service: "NEVOZ Provider", provider: provider.info(), consoleReady: consoleEnabled(config, provider) });
      }
      if (req.method === "GET" && url.pathname === "/api/catalog") {
        return json(res, 200, {
          ...config.catalog,
          gpuProfiles: Object.entries(config.catalog.gpuProfiles).map(([id, value]) => ({ id, label: value.label })),
          provider: provider.info(),
          consoleReady: consoleEnabled(config, provider)
        });
      }
      if (req.method === "GET" && url.pathname.startsWith("/console/vendor/")) {
        return serveNoVncAsset(req, res, url.pathname);
      }
      const consolePageMatch = url.pathname.match(/^\/console\/([0-9a-f-]+)$/i);
      if (req.method === "GET" && consolePageMatch) {
        const ticket = url.searchParams.get("ticket") || "";
        const ticketData = verifyConsoleTicket(ticket, config);
        const machine = ticketData && ticketData.machineId === consolePageMatch[1]
          ? store.snapshot().machines.find(item => item.id === ticketData.machineId && item.ownerDeviceId === ticketData.deviceId)
          : null;
        if (!machine || machine.state !== "running" || !machine.providerId) return json(res, 403, { error: "Ticket inválido ou Cloud PC desligado." });
        const nonce = randomBytes(18).toString("base64");
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": `default-src 'self'; script-src 'self' 'nonce-${nonce}'; style-src 'self' 'unsafe-inline'; connect-src 'self' wss: ws:; img-src 'self' data:; font-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'` });
        return res.end(consoleHtml(ticket, nonce));
      }

      if (req.method === "POST" && url.pathname === "/api/device/bootstrap") {
        const forwardedFor = req.headers["x-forwarded-for"];
        const ip = (typeof forwardedFor === "string" ? forwardedFor.split(",")[0].trim() : "") || req.socket.remoteAddress || "unknown";
        const attempt = bootstrapAttempts.get(ip) || { count: 0, reset: Date.now() + 60000 };
        if (Date.now() > attempt.reset) { attempt.count = 0; attempt.reset = Date.now() + 60000; }
        attempt.count += 1;
        bootstrapAttempts.set(ip, attempt);
        if (attempt.count > config.maxBootstrapPerMinute) return json(res, 429, { error: "Muitas ativações nesta rede. Tente novamente em um minuto." });

        const body = await readBody(req);
        const deviceId = String(body.deviceId || "");
        const deviceSecret = String(body.deviceSecret || "");
        if (!/^[0-9a-f-]{36}$/i.test(deviceId) || !/^[A-Za-z0-9_-]{40,100}$/.test(deviceSecret)) {
          throw new ProviderError("Identidade local do aplicativo inválida.", 422);
        }
        const secretHash = hash(deviceSecret);
        const existing = store.snapshot().devices.find(item => item.id === deviceId);
        if (existing) {
          if (!equalHash(existing.secretHash, secretHash)) throw new ProviderError("Este identificador já pertence a outra instalação.", 401);
          return json(res, 200, { enrolled: true, deviceId, message: "Dispositivo NEVOZ reconhecido." });
        }
        if (!config.enrollmentEnabled) throw new ProviderError("Novos dispositivos estão temporariamente desativados neste serviço.", 403);
        await store.mutate(state => {
          if (state.devices.some(item => item.id === deviceId)) throw new ProviderError("Dispositivo já registrado. Reinicie o aplicativo.", 409);
          state.devices.push({ id: deviceId, secretHash, name: String(body.deviceName || "Android NEVOZ").slice(0, 80), createdAt: new Date().toISOString() });
        });
        return json(res, 201, { enrolled: true, deviceId, message: "Dispositivo ativado automaticamente." });
      }

      const deviceId = String(req.headers["x-nevoz-device-id"] || "");
      const authorization = String(req.headers.authorization || "");
      const deviceSecret = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
      if (!deviceId || !deviceSecret) throw new ProviderError("Ativação automática do dispositivo necessária.", 401);
      const device = store.snapshot().devices.find(item => item.id === deviceId);
      if (!device || !equalHash(device.secretHash, hash(deviceSecret))) throw new ProviderError("Este dispositivo não está autorizado. Limpe os dados locais para registrá-lo novamente.", 401);

      if (req.method === "GET" && url.pathname === "/api/machines") {
        const owned = store.snapshot().machines.filter(machine => machine.ownerDeviceId === device.id);
        const machines = await Promise.all(owned.map(async machine => {
          let current = machine;
          if (machine.providerId && provider.ready) {
            try {
              const state = await provider.getStatus(machine.providerId);
              if (state !== machine.state) {
                current = { ...machine, state, updatedAt: new Date().toISOString() };
                await store.mutate(draft => {
                  const index = draft.machines.findIndex(item => item.id === machine.id);
                  if (index >= 0) draft.machines[index] = current;
                });
              }
            } catch { /* preserva o último estado confirmado */ }
          }
          return safeMachine(current, config, provider);
        }));
        return json(res, 200, { machines });
      }

      if (req.method === "POST" && url.pathname === "/api/machines") {
        if (!provider.ready) throw new ProviderError(provider.info().message, 503);
        const body = await readBody(req);
        const os = config.catalog.operatingSystems.find(item => item.id === body.os);
        const cpu = Number(body.vCpu);
        const ram = Number(body.ramGb);
        const disk = Number(body.diskGb);
        const gpu = config.catalog.gpuProfiles[body.gpuProfile];
        const name = String(body.name || "").trim();
        if (!name || name.length > 48) throw new ProviderError("O nome do Cloud PC deve ter entre 1 e 48 caracteres.", 422);
        if (!os || !config.catalog.cpuCores.includes(cpu) || !config.catalog.ramGb.includes(ram) || !config.catalog.diskGb.includes(disk) || !gpu) {
          throw new ProviderError("A configuração solicitada não está disponível no catálogo deste servidor.", 422);
        }
        const draftMachine = {
          id: randomUUID(), ownerDeviceId: device.id, name, os: os.id, osLabel: os.label,
          vCpu: cpu, ramGb: ram, diskGb: disk, gpuProfile: body.gpuProfile,
          providerId: "", state: "provisioning", errorMessage: "",
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
        };
        await store.mutate(state => {
          const ownedCount = state.machines.filter(item => item.ownerDeviceId === device.id && item.state !== "deleted").length;
          if (ownedCount >= config.maxMachinesPerDevice) throw new ProviderError(`O limite atual é de ${config.maxMachinesPerDevice} Cloud PC por dispositivo.`, 409);
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
            console.error("NEVOZ provisioning:", error.message);
            await store.mutate(state => {
              const index = state.machines.findIndex(item => item.id === draftMachine.id);
              if (index >= 0) state.machines[index] = { ...state.machines[index], providerId: error.providerId || "", state: "error", errorMessage: String(error.message || "Falha ao criar Cloud PC").slice(0, 400), updatedAt: new Date().toISOString() };
            });
          }
        });
        return json(res, 202, { machine: safeMachine(draftMachine, config, provider), message: "Criação iniciada pelo provedor NEVOZ." });
      }

      const connectMatch = url.pathname.match(/^\/api\/machines\/([0-9a-f-]+)\/connect$/i);
      if (req.method === "POST" && connectMatch) {
        if (!consoleEnabled(config, provider)) throw new ProviderError("Console remoto NEVOZ ainda não foi inicializado no servidor.", 503);
        const machine = store.snapshot().machines.find(item => item.id === connectMatch[1] && item.ownerDeviceId === device.id);
        if (!machine || !machine.providerId) throw new ProviderError("Cloud PC não encontrado ou ainda não foi provisionado.", 404);
        if (machine.state !== "running") throw new ProviderError("Ligue o Cloud PC antes de conectar.", 409);
        const ticket = createConsoleTicket(config, machine, device);
        return json(res, 200, { url: `${config.publicBaseUrl}/console/${machine.id}?ticket=${encodeURIComponent(ticket)}` });
      }

      const match = url.pathname.match(/^\/api\/machines\/([0-9a-f-]+)(?:\/(start|stop))?$/i);
      if (match) {
        const [, id, action] = match;
        const machine = store.snapshot().machines.find(item => item.id === id && item.ownerDeviceId === device.id);
        if (!machine) throw new ProviderError("Cloud PC não encontrado.", 404);
        if (req.method === "GET" && !action) return json(res, 200, { machine: safeMachine(machine, config, provider) });
        if (req.method === "POST" && action) {
          if (!machine.providerId) throw new ProviderError("A máquina ainda está sendo criada ou ocorreu uma falha no provisionamento.", 409);
          const state = action === "start" ? await provider.start(machine.providerId) : await provider.stop(machine.providerId);
          const updated = { ...machine, state, updatedAt: new Date().toISOString() };
          await store.mutate(draft => {
            const index = draft.machines.findIndex(item => item.id === id);
            if (index >= 0) draft.machines[index] = updated;
          });
          return json(res, 200, { machine: safeMachine(updated, config, provider) });
        }
        if (req.method === "DELETE" && !action) {
          if (machine.providerId) await provider.remove(machine.providerId);
          await store.mutate(draft => { draft.machines = draft.machines.filter(item => item.id !== id); });
          return json(res, 200, { deleted: true });
        }
      }
      return json(res, 404, { error: "Rota não encontrada." });
    } catch (error) {
      const status = error instanceof ProviderError ? error.status : 500;
      if (status >= 500) console.error("NEVOZ Provider API:", error.message);
      return json(res, status, { error: status === 500 ? "Erro interno do provedor NEVOZ." : error.message });
    }
  });

  server.on("upgrade", (req, socket, head) => {
    handleConsoleUpgrade(req, socket, head, config, store, provider).catch(error => {
      console.error("NEVOZ console:", error.message);
      if (!socket.destroyed) {
        socket.write("HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n");
        socket.destroy();
      }
    });
  });
  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const config = loadConfig();
  const app = await createApp({ config });
  app.listen(config.port, config.host, () => {
    console.log(`NEVOZ Provider ativo em http://${config.host}:${config.port}; engine=${config.libvirt.uri}`);
  });
}
