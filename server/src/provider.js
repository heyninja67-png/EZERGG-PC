// Provider contract: implement these methods with a real VM/GPU provider.
class ProviderNotConfiguredError extends Error {
  constructor() {
    super("Nenhum provedor real de Cloud PC foi configurado.");
    this.code = "PROVIDER_NOT_CONFIGURED";
  }
}

class CloudProvider {
  async createPersistentDisk(_input) { throw new ProviderNotConfiguredError(); }
  async createWindowsVm(_input) { throw new ProviderNotConfiguredError(); }
  async attachPersistentDisk(_vmId, _diskId) { throw new ProviderNotConfiguredError(); }
  async startVm(_vmId) { throw new ProviderNotConfiguredError(); }
  async stopVm(_vmId, _keepDisk = true) { throw new ProviderNotConfiguredError(); }
  async deleteVm(_vmId) { throw new ProviderNotConfiguredError(); }
  async deletePersistentDisk(_diskId) { throw new ProviderNotConfiguredError(); }
}

module.exports = { CloudProvider, ProviderNotConfiguredError };
