import { spawn } from "node:child_process";
import { access, mkdir, unlink, writeFile } from "node:fs/promises";
import { constants as fsConstants, existsSync } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";

export class ProviderError extends Error {
  constructor(message, status = 502) { super(message); this.status = status; }
}

function run(command, args, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stdout.setEncoding("utf8").on("data", chunk => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", chunk => { stderr += chunk; });
    child.on("error", error => { clearTimeout(timer); reject(new ProviderError(`Não foi possível executar ${command}: ${error.message}`, 503)); });
    child.on("close", code => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout.trim());
      else reject(new ProviderError((stderr || stdout || `${command} terminou com código ${code}`).trim().slice(0, 700), 502));
    });
  });
}

const xml = value => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("'", "&apos;").replaceAll('"', "&quot;");
const slug = value => String(value).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30) || "nevoz-pc";
const validPci = value => /^\d{4}:[0-9a-fA-F]{2}:[0-9a-fA-F]{2}\.\d$/.test(String(value || ""));

export class LibvirtProvider {
  constructor(config, catalog) {
    this.config = config;
    this.catalog = catalog;
    this.name = "nevoz-kvm";
    this.templatesReady = catalog.operatingSystems.every(os => {
      const template = config.templates[os.id];
      return typeof template === "string" && template.length > 0 && existsSync(template);
    });
    this.storageReady = existsSync(config.imagesDir);
    this.kvmAvailable = existsSync("/dev/kvm");
    this.ready = this.templatesReady && this.storageReady && this.kvmAvailable;
  }

  info() {
    let message = "Provedor NEVOZ local pronto. As máquinas são executadas em KVM/libvirt neste servidor.";
    if (!this.kvmAvailable) message = "KVM não está disponível em /dev/kvm. Use um host Linux x86_64 com virtualização habilitada.";
    else if (!this.storageReady) message = "A pasta persistente das máquinas não existe no servidor.";
    else if (!this.templatesReady) message = "Faltam uma ou mais imagens-base licenciadas do Windows. Consulte docs/PROVEDOR-NEVOZ.md.";
    return { ready: this.ready, name: this.name, message };
  }

  async command(args, timeoutMs) {
    return run("virsh", ["-c", this.config.uri, ...args], timeoutMs);
  }

  async assertHost() {
    if (!this.ready) throw new ProviderError(this.info().message, 503);
    await access("/dev/kvm", fsConstants.R_OK | fsConstants.W_OK).catch(() => {
      throw new ProviderError("O usuário do serviço NEVOZ não pode acessar /dev/kvm. Confira o grupo kvm e reinicie o serviço.", 503);
    });
    await this.command(["nodeinfo"], 15000);
    await run("qemu-img", ["--version"], 15000);
  }

  async createMachine(machine) {
    await this.assertHost();
    const template = this.config.templates[machine.os];
    if (!template || !existsSync(template)) throw new ProviderError(`O disco-base licenciado para ${machine.osLabel} não está instalado no servidor.`, 422);
    const gpu = this.catalog.gpuProfiles[machine.gpuProfile];
    if (!gpu) throw new ProviderError("Perfil de GPU inválido.", 422);
    if (gpu.pciAddress && !validPci(gpu.pciAddress)) throw new ProviderError("Endereço PCI da GPU inválido no catálogo do provedor.", 422);

    const domainName = `nevoz-${slug(machine.name)}-${randomBytes(3).toString("hex")}`;
    const diskPath = path.join(this.config.imagesDir, `${domainName}.qcow2`);
    let defined = false;
    try {
      await mkdir(this.config.imagesDir, { recursive: true });
      await access(template, fsConstants.R_OK);
      const info = JSON.parse(await run("qemu-img", ["info", "--output=json", template], 30000));
      const backingFormat = info.format || "qcow2";
      await run("qemu-img", ["create", "-f", "qcow2", "-F", backingFormat, "-b", template, diskPath, `${machine.diskGb}G`], 120000);
      const pciXml = gpu.pciAddress ? this.pciXml(gpu.pciAddress) : "";
      const tpmXml = this.config.tpm ? "<tpm model='tpm-crb'><backend type='emulator' version='2.0'/></tpm>" : "";
      const domainXml = this.domainXml({ domainName, diskPath, machine, pciXml, tpmXml });
      const xmlPath = path.join(this.config.imagesDir, `${domainName}.xml`);
      await writeFile(xmlPath, domainXml, { mode: 0o640 });
      try { await this.command(["define", xmlPath], 30000); }
      finally { await unlink(xmlPath).catch(() => {}); }
      defined = true;
      await this.command(["start", domainName], 60000);
      return { providerId: domainName, state: "running" };
    } catch (error) {
      if (defined) await this.command(["undefine", domainName, "--nvram"], 30000).catch(() => {});
      await unlink(diskPath).catch(() => {});
      throw error;
    }
  }

  domainXml({ domainName, diskPath, machine, pciXml, tpmXml }) {
    const memoryKiB = machine.ramGb * 1024 * 1024;
    return `<?xml version='1.0' encoding='UTF-8'?>
<domain type='kvm'>
  <name>${xml(domainName)}</name>
  <memory unit='KiB'>${memoryKiB}</memory>
  <currentMemory unit='KiB'>${memoryKiB}</currentMemory>
  <vcpu placement='static'>${machine.vCpu}</vcpu>
  <os firmware='efi'>
    <type arch='x86_64' machine='q35'>hvm</type>
    <firmware><feature enabled='yes' name='secure-boot'/><feature enabled='yes' name='enrolled-keys'/></firmware>
    <boot dev='hd'/>
  </os>
  <features><acpi/><apic/><smm state='on'/></features>
  <cpu mode='host-passthrough' check='none'/>
  <clock offset='localtime'/>
  <on_poweroff>destroy</on_poweroff><on_reboot>restart</on_reboot><on_crash>restart</on_crash>
  <devices>
    <disk type='file' device='disk'><driver name='qemu' type='qcow2' cache='none'/><source file='${xml(diskPath)}'/><target dev='vda' bus='virtio'/></disk>
    <interface type='network'><source network='${xml(this.config.network)}'/><model type='virtio'/></interface>
    <graphics type='vnc' port='-1' autoport='yes' listen='127.0.0.1'/>
    <video><model type='virtio' heads='1' primary='yes'/></video>
    <memballoon model='virtio'/>
    ${tpmXml}
    ${pciXml}
  </devices>
</domain>`;
  }

  pciXml(address) {
    const [domain, bus, slotFunction] = address.split(":");
    const [slot, fn] = slotFunction.split(".");
    return `<hostdev mode='subsystem' type='pci' managed='yes'><source><address domain='0x${domain}' bus='0x${bus}' slot='0x${slot}' function='0x${fn}'/></source></hostdev>`;
  }

  async getStatus(providerId) {
    const raw = await this.command(["domstate", providerId], 15000);
    const state = raw.toLowerCase();
    if (state.includes("running")) return "running";
    if (state.includes("shut off") || state.includes("shutoff")) return "stopped";
    if (state.includes("paused")) return "paused";
    if (state.includes("crashed")) return "error";
    if (state.includes("in shutdown")) return "stopping";
    return state.replace(/\s+/g, "-") || "unknown";
  }

  async start(providerId) {
    await this.command(["start", providerId], 60000);
    return this.getStatus(providerId);
  }

  async stop(providerId) {
    await this.command(["shutdown", providerId], 30000);
    return "stopping";
  }

  async remove(providerId) {
    const diskPath = path.join(this.config.imagesDir, `${providerId}.qcow2`);
    const state = await this.getStatus(providerId).catch(() => "missing");
    if (state === "running" || state === "paused" || state === "stopping") await this.command(["destroy", providerId], 30000).catch(() => {});
    await this.command(["undefine", providerId, "--nvram"], 30000).catch(async () => this.command(["undefine", providerId], 30000));
    await unlink(diskPath).catch(error => { if (error.code !== "ENOENT") throw error; });
  }

  async consoleTarget(providerId) {
    const raw = await this.command(["vncdisplay", providerId], 15000);
    const match = raw.match(/:(\d+)$/);
    if (!match) throw new ProviderError("O QEMU não informou uma tela VNC para esta máquina.", 503);
    const displayOrPort = Number(match[1]);
    const port = displayOrPort < 5900 ? 5900 + displayOrPort : displayOrPort;
    if (!Number.isInteger(port) || port < 5900 || port > 6999) throw new ProviderError("Porta VNC local inválida.", 503);
    return { host: "127.0.0.1", port };
  }
}

export function createProvider(config) {
  return new LibvirtProvider(config.libvirt, config.catalog);
}
