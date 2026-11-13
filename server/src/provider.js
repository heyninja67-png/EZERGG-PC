export class ProviderError extends Error {
  constructor(message, status = 502) { super(message); this.status = status; }
}

export class UnconfiguredProvider {
  constructor() { this.ready = false; this.name = "none"; }
  info() { return { ready: false, name: this.name, message: "Nenhum provedor configurado. Configure NEVOZ_PROVIDER e as credenciais no backend." }; }
  async createMachine() { throw new ProviderError("Provisionamento indisponível: nenhum provedor está configurado no servidor.", 503); }
  async getStatus() { throw new ProviderError("Nenhum provedor configurado.", 503); }
  async start() { throw new ProviderError("Nenhum provedor configurado.", 503); }
  async stop() { throw new ProviderError("Nenhum provedor configurado.", 503); }
  async remove() { throw new ProviderError("Nenhum provedor configurado.", 503); }
}

export class ProxmoxProvider {
  constructor(config, connectionUrlTemplate = "") {
    this.config = config;
    this.connectionUrlTemplate = connectionUrlTemplate;
    this.name = "proxmox";
    this.ready = Boolean(config.url && config.tokenId && config.tokenSecret && config.node && Object.keys(config.templateMap).length);
  }

  info() {
    return {
      ready: this.ready,
      name: this.name,
      message: this.ready
        ? "Proxmox configurado. A conexão/autorização será confirmada ao executar a primeira operação."
        : "Proxmox selecionado, mas faltam URL, token, nó ou mapa de templates no backend."
    };
  }

  async request(path, method = "GET", body = undefined) {
    if (!this.ready) throw new ProviderError("Configuração Proxmox incompleta no backend.", 503);
    const headers = { Authorization: `PVEAPIToken=${this.config.tokenId}=${this.config.tokenSecret}` };
    const options = { method, headers, signal: AbortSignal.timeout(45000) };
    if (body) {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      options.body = new URLSearchParams(Object.entries(body).map(([k, v]) => [k, String(v)])).toString();
    }
    let response;
    try { response = await fetch(`${this.config.url}/api2/json${path}`, options); }
    catch (error) { throw new ProviderError(`Falha ao conectar ao Proxmox: ${error.message}`); }
    const raw = await response.text();
    let parsed = {};
    try { parsed = raw ? JSON.parse(raw) : {}; } catch { /* erro tratado abaixo */ }
    if (!response.ok) {
      const detail = parsed.errors ? JSON.stringify(parsed.errors) : parsed.message || `HTTP ${response.status}`;
      throw new ProviderError(`Proxmox respondeu com erro: ${detail}`, 502);
    }
    return parsed.data;
  }

  async waitTask(upid, timeoutMs = 600000) {
    if (!upid || typeof upid !== "string") return;
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const status = await this.request(`/nodes/${encodeURIComponent(this.config.node)}/tasks/${encodeURIComponent(upid)}/status`);
      if (status.status === "stopped") {
        if (status.exitstatus !== "OK") throw new ProviderError(`Tarefa Proxmox falhou: ${status.exitstatus || "sem detalhes"}`);
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 2500));
    }
    throw new ProviderError("Tempo limite aguardando a tarefa do Proxmox.", 504);
  }

  async createMachine(machine) {
    const template = Number(this.config.templateMap[machine.os]);
    if (!Number.isInteger(template) || template <= 0) throw new ProviderError(`Não há template Windows configurado para ${machine.osLabel}.`, 422);
    const nextId = Number(await this.request("/cluster/nextid"));
    if (!Number.isInteger(nextId) || nextId <= 0) throw new ProviderError("Proxmox não retornou um VMID válido.");
    const name = machine.name.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").slice(0, 48) || `nevoz-${nextId}`;
    if (machine.diskGb < this.config.templateDiskGb) throw new ProviderError(`O SSD solicitado (${machine.diskGb} GB) é menor que o disco-base do template (${this.config.templateDiskGb} GB).`, 422);
    let cloneCompleted = false;
    try {
      const cloneBody = { newid: nextId, name, target: this.config.node, full: 1 };
      if (this.config.storage) cloneBody.storage = this.config.storage;
      const cloneTask = await this.request(`/nodes/${encodeURIComponent(this.config.node)}/qemu/${template}/clone`, "POST", cloneBody);
      await this.waitTask(cloneTask);
      cloneCompleted = true;
      const cfg = { name, cores: machine.vCpu, sockets: 1, memory: machine.ramGb * 1024 };
      if (this.config.bridge) cfg.net0 = `virtio,bridge=${this.config.bridge}`;
      const gpu = this.config.gpuProfiles?.[machine.gpuProfile];
      if (gpu?.hostpci) cfg.hostpci0 = gpu.hostpci;
      await this.request(`/nodes/${encodeURIComponent(this.config.node)}/qemu/${nextId}/config`, "PUT", cfg);
      const extraDisk = machine.diskGb - this.config.templateDiskGb;
      if (extraDisk > 0) {
        const resizeTask = await this.request(`/nodes/${encodeURIComponent(this.config.node)}/qemu/${nextId}/resize`, "PUT", {
          disk: "scsi0", size: `+${extraDisk}G`
        });
        await this.waitTask(resizeTask);
      }
      const startTask = await this.request(`/nodes/${encodeURIComponent(this.config.node)}/qemu/${nextId}/status/start`, "POST", {});
      await this.waitTask(startTask);
      return { providerId: String(nextId), state: "running" };
    } catch (error) {
      if (cloneCompleted) error.providerId = String(nextId);
      throw error;
    }
  }

  async getStatus(providerId) {
    const status = await this.request(`/nodes/${encodeURIComponent(this.config.node)}/qemu/${encodeURIComponent(providerId)}/status/current`);
    return status.status === "running" ? "running" : status.status === "stopped" ? "stopped" : status.status || "unknown";
  }
  async start(providerId) {
    const task = await this.request(`/nodes/${encodeURIComponent(this.config.node)}/qemu/${encodeURIComponent(providerId)}/status/start`, "POST", {});
    await this.waitTask(task);
    return this.getStatus(providerId);
  }
  async stop(providerId) {
    const task = await this.request(`/nodes/${encodeURIComponent(this.config.node)}/qemu/${encodeURIComponent(providerId)}/status/shutdown`, "POST", {});
    await this.waitTask(task);
    return this.getStatus(providerId);
  }
  async remove(providerId) {
    const task = await this.request(`/nodes/${encodeURIComponent(this.config.node)}/qemu/${encodeURIComponent(providerId)}`, "DELETE", { purge: 1, "destroy-unreferenced-disks": 1 });
    await this.waitTask(task);
  }
  connectionUrl(providerId) {
    if (!this.connectionUrlTemplate) return "";
    return this.connectionUrlTemplate.replaceAll("{vmid}", encodeURIComponent(providerId));
  }
}

export function createProvider(config) {
  if (config.providerName === "proxmox") {
    const p = new ProxmoxProvider({ ...config.proxmox, gpuProfiles: config.catalog.gpuProfiles }, config.connectionUrlTemplate);
    return p;
  }
  return new UnconfiguredProvider();
}
