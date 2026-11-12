"""Initial KVM/libvirt adapter.

It can inspect host capacity and control pre-existing libvirt domains. Automated
Windows image cloning, unattended install, GPU assignment and volume lifecycle
are intentionally not enabled until an operator supplies a validated template.
"""
import shutil
import subprocess
from .base import ProvisionRequest, ProviderInstance, ProviderError
from ..config import settings


class LibvirtProvider:
    name = "libvirt"
    is_demo = False

    def _run(self, *args: str) -> str:
        if not shutil.which("virsh"):
            raise ProviderError("virsh não está instalado no host de virtualização.")
        result = subprocess.run(["virsh", "-c", settings.libvirt_uri, *args], capture_output=True, text=True, timeout=20)
        if result.returncode != 0:
            raise ProviderError((result.stderr or result.stdout or "Falha no libvirt").strip()[:500])
        return result.stdout

    def capacity(self) -> dict:
        try:
            node_info = self._run("nodeinfo")
            lines = {line.split(":", 1)[0].strip().lower(): line.split(":", 1)[1].strip() for line in node_info.splitlines() if ":" in line}
            cpu_count = int(lines.get("cpus", "0"))
            memory_kb = int(lines.get("memory size", "0").split()[0]) if lines.get("memory size") else 0
            total_ram_gb = max(0, memory_kb // 1024 // 1024)
            return {
                "mode": "libvirt",
                "verified": False,
                "region": "host-local",
                # Physical totals are not free capacity. Do not publish selectable
                # profiles until reservations, storage pools and image catalog exist.
                "cpu_profiles": [],
                "ram_profiles": [],
                "storage_profiles": [],
                "os_images": [],
                "gpu_profiles": [],
                "message": f"Host libvirt detectado ({cpu_count} CPUs lógicos, aproximadamente {total_ram_gb} GiB de RAM). Capacidade livre ainda não foi calculada por scheduler; nenhum perfil pode ser provisionado.",
            }
        except (ProviderError, ValueError):
            return {
                "mode": "libvirt", "verified": False, "region": "host-local",
                "cpu_profiles": [], "ram_profiles": [], "storage_profiles": [], "os_images": [], "gpu_profiles": [],
                "message": "Não foi possível verificar a capacidade do host libvirt. Verifique o socket, permissões e virsh.",
            }

    def create(self, request: ProvisionRequest) -> ProviderInstance:
        raise ProviderError("Provisionamento Windows via KVM ainda não está habilitado. Configure uma imagem-base licenciada, template unattended, storage pool e rede antes de ativar criação de VMs.")

    def start(self, instance_id: str) -> ProviderInstance:
        self._run("start", instance_id)
        return ProviderInstance(instance_id=instance_id, status="RUNNING")

    def stop(self, instance_id: str) -> ProviderInstance:
        self._run("shutdown", instance_id)
        return ProviderInstance(instance_id=instance_id, status="STOPPED")

    def restart(self, instance_id: str) -> ProviderInstance:
        self._run("reboot", instance_id)
        return ProviderInstance(instance_id=instance_id, status="RUNNING")

    def delete(self, instance_id: str) -> None:
        raise ProviderError("Exclusão de domínio e volume requer política de retenção e não está habilitada neste adaptador inicial.")
