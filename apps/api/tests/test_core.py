from app.security import hash_password, verify_password, create_access_token, decode_access_token
from app.providers.mock import MockProvider
from app.providers.base import ProvisionRequest


def test_password_hashing():
    hashed = hash_password("Senha-super-segura-2026!")
    assert hashed != "Senha-super-segura-2026!"
    assert verify_password("Senha-super-segura-2026!", hashed)
    assert not verify_password("senha-errada", hashed)


def test_jwt_round_trip():
    token = create_access_token("user-123")
    assert decode_access_token(token) == "user-123"


def test_demo_provider_is_explicitly_unverified():
    provider = MockProvider()
    capacity = provider.capacity()
    assert capacity["mode"] == "demo"
    assert capacity["verified"] is False
    assert "nenhuma vm" in capacity["message"].lower()


def test_demo_provider_lifecycle():
    provider = MockProvider()
    req = ProvisionRequest("Meu PC", "windows-11", 4, 16, 1024, "none", "u1", "pc1")
    instance = provider.create(req)
    assert instance.status == "STOPPED"
    assert provider.start(instance.instance_id).status == "RUNNING"
    assert provider.stop(instance.instance_id).status == "STOPPED"
