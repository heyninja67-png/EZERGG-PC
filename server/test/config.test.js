import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../src/config.js";
import { createProvider, LibvirtProvider } from "../src/provider.js";
import { createApp } from "../src/server.js";
import { Store } from "../src/store.js";

const identity = () => ({
  deviceId: "123e4567-e89b-42d3-a456-426614174000",
  deviceSecret: "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG"
});

async function startTestServer(config, provider) {
  const server = await createApp({ config, store: new Store(config.dataFile), provider });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

async function bootstrap(base, body = identity()) {
  return fetch(`${base}/api/device/bootstrap`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...body, deviceName: "Test Android" })
  });
}

function authHeaders(body = identity()) {
  return {
    "x-nevoz-device-id": body.deviceId,
    authorization: `Bearer ${body.deviceSecret}`,
    "content-type": "application/json"
  };
}

test("catálogo padrão não anuncia GPU dedicada sem configuração", () => {
  const config = loadConfig({});
  assert.deepEqual(Object.keys(config.catalog.gpuProfiles), ["none"]);
  assert.equal(config.catalog.gpuProfiles.none.label, "GPU não selecionada");
});

test("provider padrão é o provedor local KVM e não uma API de terceiros", () => {
  const config = loadConfig({});
  const provider = createProvider(config);
  assert.ok(provider instanceof LibvirtProvider);
  assert.equal(provider.info().ready, false);
  assert.equal(provider.info().name, "nevoz-kvm");
});

test("JSON inválido para o mapa de imagens falha na inicialização", () => {
  assert.throws(() => loadConfig({ NEVOZ_WINDOWS_TEMPLATES_JSON: "isto-nao-e-json" }), /JSON válido/);
});

test("console remoto só é anunciado quando o endereço público usa HTTPS", async () => {
  const dir = await mkdtemp(join(tmpdir(), "nevoz-console-config-test-"));
  const config = loadConfig({
    NEVOZ_DATA_FILE: join(dir, "db.json"),
    NEVOZ_PUBLIC_BASE_URL: "http://api.example.test",
    NEVOZ_CONSOLE_SECRET: "test-secret"
  });
  const provider = {
    ready: false,
    info: () => ({ ready: false, name: "test", message: "Host indisponível" }),
    consoleTarget: async () => ({ host: "127.0.0.1", port: 5900 })
  };
  const { server, base } = await startTestServer(config, provider);
  try {
    const catalog = await fetch(`${base}/api/catalog`).then(response => response.json());
    assert.equal(catalog.consoleReady, false);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});

test("API registra instalação automaticamente sem código de pareamento", async () => {
  const dir = await mkdtemp(join(tmpdir(), "nevoz-bootstrap-test-"));
  const config = loadConfig({ NEVOZ_DATA_FILE: join(dir, "db.json") });
  const provider = { ready: false, info: () => ({ ready: false, name: "test", message: "Host indisponível" }) };
  const { server, base } = await startTestServer(config, provider);
  try {
    const catalog = await fetch(`${base}/api/catalog`).then(response => response.json());
    assert.equal(catalog.provider.ready, false);
    const registration = await bootstrap(base);
    assert.equal(registration.status, 201);
    assert.equal((await registration.json()).enrolled, true);
    const machines = await fetch(`${base}/api/machines`, { headers: authHeaders() }).then(response => response.json());
    assert.deepEqual(machines.machines, []);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});

test("instalação já registrada precisa apresentar o segredo original", async () => {
  const dir = await mkdtemp(join(tmpdir(), "nevoz-identity-test-"));
  const config = loadConfig({ NEVOZ_DATA_FILE: join(dir, "db.json") });
  const provider = { ready: false, info: () => ({ ready: false, name: "test", message: "Host indisponível" }) };
  const { server, base } = await startTestServer(config, provider);
  try {
    assert.equal((await bootstrap(base)).status, 201);
    const wrong = { ...identity(), deviceSecret: "ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ" };
    assert.equal((await bootstrap(base, wrong)).status, 401);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});

test("API cria e lista apenas a VM retornada pelo provedor", async () => {
  const dir = await mkdtemp(join(tmpdir(), "nevoz-provider-test-"));
  const config = loadConfig({
    NEVOZ_DATA_FILE: join(dir, "db.json"),
    NEVOZ_MAX_MACHINES_PER_DEVICE: "2",
    NEVOZ_PUBLIC_BASE_URL: "https://api.example.test",
    NEVOZ_CONSOLE_SECRET: "test-console-secret"
  });
  const provider = {
    ready: true,
    info: () => ({ ready: true, name: "test-provider", message: "Provider de teste" }),
    createMachine: async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
      return { providerId: "nevoz-test-001", state: "running" };
    },
    getStatus: async () => "running",
    start: async () => "running",
    stop: async () => "stopping",
    remove: async () => {},
    consoleTarget: async () => ({ host: "127.0.0.1", port: 5900 })
  };
  const { server, base } = await startTestServer(config, provider);
  try {
    assert.equal((await bootstrap(base)).status, 201);
    const headers = authHeaders();
    const createdResponse = await fetch(`${base}/api/machines`, {
      method: "POST", headers,
      body: JSON.stringify({ name: "Cloud PC", os: "windows-11-pro", vCpu: 4, ramGb: 8, diskGb: 250, gpuProfile: "none" })
    });
    assert.equal(createdResponse.status, 202);
    const accepted = (await createdResponse.json()).machine;
    assert.equal(accepted.state, "provisioning");
    let list = { machines: [] };
    for (let attempt = 0; attempt < 20; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 10));
      list = await fetch(`${base}/api/machines`, { headers }).then(response => response.json());
      if (list.machines[0]?.providerId) break;
    }
    assert.equal(list.machines.length, 1);
    assert.equal(list.machines[0].providerId, "nevoz-test-001");
    assert.equal(list.machines[0].state, "running");
    assert.equal(list.machines[0].connectionAvailable, true);
    assert.equal(Object.hasOwn(list.machines[0], "connectionUrl"), false);
    const connectResponse = await fetch(`${base}/api/machines/${accepted.id}/connect`, { method: "POST", headers });
    assert.equal(connectResponse.status, 200);
    const connect = await connectResponse.json();
    assert.match(connect.url, /^https:\/\/api\.example\.test\/console\//);
    assert.match(connect.url, /[?]ticket=/);
    const consoleTarget = new URL(connect.url);
    const consolePage = await fetch(`${base}${consoleTarget.pathname}${consoleTarget.search}`);
    assert.equal(consolePage.status, 200);
    const html = await consolePage.text();
    const csp = consolePage.headers.get("content-security-policy") || "";
    const nonce = html.match(/<script type="module" nonce="([^"]+)"/)?.[1];
    assert.ok(nonce);
    assert.ok(csp.includes(`'nonce-${nonce}'`));
    assert.match(html, /\/console\/vendor\/core\/rfb\.js/);
    assert.equal(list.machines[0].name, "Cloud PC");
  } finally {
    await new Promise(resolve => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});

test("API respeita o limite de Cloud PCs por instalação", async () => {
  const dir = await mkdtemp(join(tmpdir(), "nevoz-quota-test-"));
  const config = loadConfig({ NEVOZ_DATA_FILE: join(dir, "db.json"), NEVOZ_MAX_MACHINES_PER_DEVICE: "1" });
  const provider = {
    ready: true,
    info: () => ({ ready: true, name: "test-provider", message: "ok" }),
    createMachine: async () => ({ providerId: "vm-1", state: "running" }),
    getStatus: async () => "running",
    consoleTarget: async () => ({ host: "127.0.0.1", port: 5900 })
  };
  const { server, base } = await startTestServer(config, provider);
  try {
    await bootstrap(base);
    const headers = authHeaders();
    const body = JSON.stringify({ name: "PC", os: "windows-11-pro", vCpu: 4, ramGb: 8, diskGb: 250, gpuProfile: "none" });
    const first = await fetch(`${base}/api/machines`, { method: "POST", headers, body });
    assert.equal(first.status, 202);
    const second = await fetch(`${base}/api/machines`, { method: "POST", headers, body });
    assert.equal(second.status, 409);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});
