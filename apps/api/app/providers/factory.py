from .mock import MockProvider
from .libvirt import LibvirtProvider
from .base import ProviderError
from ..config import settings


def get_provider():
    provider = settings.provider.lower()
    if provider == "mock":
        return MockProvider()
    if provider == "libvirt":
        return LibvirtProvider()
    raise ProviderError(f"Provider desconhecido: {provider}")
