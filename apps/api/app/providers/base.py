from dataclasses import dataclass
from typing import Protocol


class ProviderError(RuntimeError):
    pass


@dataclass
class ProvisionRequest:
    name: str
    os_image: str
    cpu_cores: int
    ram_gb: int
    storage_gb: int
    gpu_sku: str
    owner_id: str
    cloud_pc_id: str


@dataclass
class ProviderInstance:
    instance_id: str
    status: str


class InfrastructureProvider(Protocol):
    name: str
    is_demo: bool

    def capacity(self) -> dict: ...
    def create(self, request: ProvisionRequest) -> ProviderInstance: ...
    def start(self, instance_id: str) -> ProviderInstance: ...
    def stop(self, instance_id: str) -> ProviderInstance: ...
    def restart(self, instance_id: str) -> ProviderInstance: ...
    def delete(self, instance_id: str) -> None: ...
