import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../src/config.js";
import { createProvider, UnconfiguredProvider } from "../src/provider.js";

test("catálogo padrão não anuncia GPU dedicada como disponível", () => {
  const config = loadConfig({});
  assert.deepEqual(Object.keys(config.catalog.gpuProfiles), ["none"]);
  assert.equal(config.catalog.gpuProfiles.none.label, "Sem GPU");
});

test("provider padrão fica explicitamente desativado", () => {
  const config = loadConfig({});
  const provider = createProvider(config);
  assert.ok(provider instanceof UnconfiguredProvider);
  assert.equal(provider.info().ready, false);
});

test("mapa de templates inválido falha na inicialização", () => {
  assert.throws(() => loadConfig({ PROXMOX_TEMPLATE_MAP_JSON: "isso-nao-e-json" }), /JSON válido/);
});

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../src/server.js";
import { Store } from "../src/store.js";

test("API pareia dispositivo e não mostra máquina fictícia", async () => {
  const dir = await mkdtemp(join(tmpdir(), "nevoz-test-"));
  const config = loadConfig({ NEVOZ_PAIRING_CODE: "test-pair-code", NEVOZ_DATA_FILE: join(dir, "db.json") });
  const provider = new UnconfiguredProvider();
  const server = await createApp({ config, store: new Store(config.dataFile), provider });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const catalog = await fetch(`${base}/api/catalog`).then(r => r.json());
    assert.equal(catalog.provider.ready, false);
    const pair = await fetch(`${base}/api/pair`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ pairingCode: "test-pair-code", deviceName: "test" })
    }).then(r => r.json());
    assert.ok(pair.token);
    const machines = await fetch(`${base}/api/machines`, { headers: { authorization: `Bearer ${pair.token}` } }).then(r => r.json());
    assert.deepEqual(machines.machines, []);
    const create = await fetch(`${base}/api/machines`, {
      method: "POST", headers: { authorization: `Bearer ${pair.token}`, "content-type": "application/json" },
      body: JSON.stringify({ name: "fake", os: "windows-11-pro", vCpu: 8, ramGb: 16, diskGb: 250, gpuProfile: "none" })
    });
    assert.equal(create.status, 503);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});


test("API cria e lista somente uma VM retornada pelo provider", async () => {
  const dir = await mkdtemp(join(tmpdir(), "nevoz-provider-test-"));
  const config = loadConfig({ NEVOZ_PAIRING_CODE: "pair-2", NEVOZ_DATA_FILE: join(dir, "db.json") });
  const provider = {
    ready: true,
    info: () => ({ ready: true, name: "test-provider", message: "Provider de teste" }),
    createMachine: async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
      return { providerId: "321", state: "running" };
    },
    getStatus: async () => "running",
    start: async () => "running",
    stop: async () => "stopped",
    remove: async () => {},
    connectionUrl: id => `https://remote.example/${id}`
  };
  const server = await createApp({ config, store: new Store(config.dataFile), provider });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const paired = await fetch(`${base}/api/pair`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ pairingCode: "pair-2", deviceName: "test" })
    }).then(r => r.json());
    const headers = { authorization: `Bearer ${paired.token}`, "content-type": "application/json" };
    const createdResponse = await fetch(`${base}/api/machines`, {
      method: "POST", headers,
      body: JSON.stringify({ name: "Cloud PC", os: "windows-11-pro", vCpu: 8, ramGb: 16, diskGb: 250, gpuProfile: "none" })
    });
    assert.equal(createdResponse.status, 202);
    const accepted = (await createdResponse.json()).machine;
    assert.equal(accepted.state, "provisioning");
    let list = { machines: [] };
    for (let attempt = 0; attempt < 20; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 10));
      list = await fetch(`${base}/api/machines`, { headers }).then(r => r.json());
      if (list.machines[0]?.providerId) break;
    }
    assert.equal(list.machines.length, 1);
    assert.equal(list.machines[0].providerId, "321");
    assert.equal(list.machines[0].state, "running");
    assert.equal(list.machines[0].connectionUrl, "https://remote.example/321");
    assert.equal(list.machines[0].name, "Cloud PC");
  } finally {
    await new Promise(resolve => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});
