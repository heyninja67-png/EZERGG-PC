"""Explicit demo provider. It simulates lifecycle only; it never creates a VM."""
import uuid
from .base import ProvisionRequest, ProviderInstance


class MockProvider:
    name = "mock"
    is_demo = True

    def capacity(self) -> dict:
        return {
            "mode": "demo",
            "verified": False,
            "region": "demo",
            "cpu_profiles": [2, 4, 6, 8, 12, 16, 24, 32, 64],
            "ram_profiles": [8, 16, 32, 64, 128, 256],
            "storage_profiles": [1024, 2048, 4096, 8192],
            "os_images": ["windows-11", "windows-11-pro", "windows-11-enterprise"],
            "gpu_profiles": [
                {"id": "none", "label": "Sem GPU dedicada", "available": True, "verified": False, "details": "Disponibilidade física não verificada."},
                {"id": "gpu-basic-demo", "label": "GPU Basic (demonstração)", "available": True, "verified": False, "details": "Perfil ilustrativo; não corresponde a uma placa física alocada."},
            ],
            "message": "Modo demonstração: ações e capacidade são simuladas. Nenhuma VM, GPU ou disco físico é provisionado.",
        }

    def create(self, request: ProvisionRequest) -> ProviderInstance:
        return ProviderInstance(instance_id=f"demo-{uuid.uuid4()}", status="STOPPED")

    def start(self, instance_id: str) -> ProviderInstance:
        return ProviderInstance(instance_id=instance_id, status="RUNNING")

    def stop(self, instance_id: str) -> ProviderInstance:
        return ProviderInstance(instance_id=instance_id, status="STOPPED")

    def restart(self, instance_id: str) -> ProviderInstance:
        return ProviderInstance(instance_id=instance_id, status="RUNNING")

    def delete(self, instance_id: str) -> None:
        return None
