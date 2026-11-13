const parseList = (value, fallback) => {
  const parsed = String(value ?? "").split(",").map(v => Number(v.trim())).filter(v => Number.isInteger(v) && v > 0);
  return parsed.length ? [...new Set(parsed)].sort((a, b) => a - b) : fallback;
};

function parseJson(env, name, fallback) {
  const value = env[name];
  if (!value) return fallback;
  try { return JSON.parse(value); }
  catch { throw new Error(`${name} precisa conter JSON válido.`); }
}

export function loadConfig(env = process.env) {
  const gpuProfiles = parseJson(env, "NEVOZ_GPU_PROFILES_JSON", {
    none: { label: "GPU não selecionada" }
  });
  const templates = parseJson(env, "NEVOZ_WINDOWS_TEMPLATES_JSON", {});
  return {
    host: env.NEVOZ_HOST || "127.0.0.1",
    port: Number(env.PORT || 8080),
    dataFile: env.NEVOZ_DATA_FILE || "/var/lib/nevoz-provider/state.json",
    enrollmentEnabled: String(env.NEVOZ_ALLOW_GUEST_ENROLLMENT ?? "true").toLowerCase() === "true",
    publicBaseUrl: (env.NEVOZ_PUBLIC_BASE_URL || "").trim().replace(/\/$/, ""),
    consoleSecret: env.NEVOZ_CONSOLE_SECRET || "",
    maxMachinesPerDevice: Math.max(1, Number(env.NEVOZ_MAX_MACHINES_PER_DEVICE || 1)),
    maxBootstrapPerMinute: Math.max(1, Number(env.NEVOZ_MAX_BOOTSTRAP_PER_MINUTE || 8)),
    catalog: {
      operatingSystems: [
        { id: "windows-11", label: "Windows 11" },
        { id: "windows-11-pro", label: "Windows 11 Pro" },
        { id: "windows-11-enterprise", label: "Windows 11 Enterprise" }
      ],
      cpuCores: parseList(env.NEVOZ_CPU_OPTIONS, [2, 4, 6, 8, 12, 16]),
      ramGb: parseList(env.NEVOZ_RAM_OPTIONS, [4, 8, 16, 32, 64]),
      diskGb: parseList(env.NEVOZ_DISK_OPTIONS, [100, 250, 500, 1000, 2000]),
      gpuProfiles
    },
    libvirt: {
      uri: env.LIBVIRT_URI || "qemu:///system",
      network: env.LIBVIRT_NETWORK || "default",
      imagesDir: env.NEVOZ_IMAGES_DIR || "/var/lib/libvirt/images/nevoz",
      templates,
      tpm: String(env.NEVOZ_TPM_ENABLED ?? "true").toLowerCase() === "true"
    }
  };
}
