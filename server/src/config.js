const list = (value, fallback) => {
  const parsed = String(value ?? "").split(",").map(v => Number(v.trim())).filter(v => Number.isInteger(v) && v > 0);
  return parsed.length ? [...new Set(parsed)].sort((a, b) => a - b) : fallback;
};

function jsonEnv(name, fallback) {
  const value = process.env[name];
  if (!value) return fallback;
  try { return JSON.parse(value); }
  catch { throw new Error(`${name} precisa conter JSON válido.`); }
}

export function loadConfig(env = process.env) {
  const gpuProfiles = (() => {
    if (!env.NEVOZ_GPU_PROFILES_JSON) return { none: { label: "Sem GPU", hostpci: "" } };
    try { return JSON.parse(env.NEVOZ_GPU_PROFILES_JSON); }
    catch { throw new Error("NEVOZ_GPU_PROFILES_JSON precisa conter JSON válido."); }
  })();
  const templateMap = (() => {
    if (!env.PROXMOX_TEMPLATE_MAP_JSON) return {};
    try { return JSON.parse(env.PROXMOX_TEMPLATE_MAP_JSON); }
    catch { throw new Error("PROXMOX_TEMPLATE_MAP_JSON precisa conter JSON válido."); }
  })();
  return {
    port: Number(env.PORT || 8080),
    dataFile: env.NEVOZ_DATA_FILE || "/data/nevoz.json",
    pairingCode: env.NEVOZ_PAIRING_CODE || "",
    providerName: (env.NEVOZ_PROVIDER || "none").toLowerCase(),
    connectionUrlTemplate: env.NEVOZ_CONNECTION_URL_TEMPLATE || "",
    catalog: {
      operatingSystems: [
        { id: "windows-11", label: "Windows 11" },
        { id: "windows-11-pro", label: "Windows 11 Pro" },
        { id: "windows-11-enterprise", label: "Windows 11 Enterprise" }
      ],
      cpuCores: list(env.NEVOZ_CPU_OPTIONS, [4, 8, 16]),
      ramGb: list(env.NEVOZ_RAM_OPTIONS, [8, 16, 32, 64]),
      diskGb: list(env.NEVOZ_DISK_OPTIONS, [100, 250, 500, 1000, 2000]),
      gpuProfiles
    },
    proxmox: {
      url: (env.PROXMOX_URL || "").replace(/\/$/, ""),
      tokenId: env.PROXMOX_TOKEN_ID || "",
      tokenSecret: env.PROXMOX_TOKEN_SECRET || "",
      node: env.PROXMOX_NODE || "",
      storage: env.PROXMOX_STORAGE || "",
      templateMap,
      templateDiskGb: Number(env.PROXMOX_TEMPLATE_DISK_GB || 100),
      bridge: env.PROXMOX_BRIDGE || "vmbr0"
    }
  };
}
