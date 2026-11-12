import uuid
from fastapi.testclient import TestClient
from app.main import app
from app.database import SessionLocal
from app.models import StorageVolume


def _register(client: TestClient, suffix: str) -> str:
    response = client.post("/api/v1/auth/register", json={
        "email": f"{suffix}-{uuid.uuid4()}@example.com",
        "display_name": "Usuário de teste",
        "password": "Senha-de-teste-2026!",
    })
    assert response.status_code == 201, response.text
    return response.json()["access_token"]


def test_cloud_pc_owner_isolation_and_volume_retention():
    with TestClient(app) as client:
        token_a = _register(client, "owner-a")
        token_b = _register(client, "owner-b")
        headers_a = {"Authorization": f"Bearer {token_a}"}
        headers_b = {"Authorization": f"Bearer {token_b}"}

        created = client.post("/api/v1/cloud-pcs", headers=headers_a, json={
            "name": "PC persistente teste", "os_image": "windows-11", "cpu_cores": 4,
            "ram_gb": 16, "storage_gb": 1024, "gpu_sku": "none",
        })
        assert created.status_code == 201, created.text
        pc = created.json()
        assert pc["is_demo"] is True

        forbidden = client.post(f"/api/v1/cloud-pcs/{pc['id']}/start", headers=headers_b)
        assert forbidden.status_code == 404

        assert client.post(f"/api/v1/cloud-pcs/{pc['id']}/start", headers=headers_a).status_code == 200
        assert client.post(f"/api/v1/cloud-pcs/{pc['id']}/stop", headers=headers_a).status_code == 200
        assert client.delete(f"/api/v1/cloud-pcs/{pc['id']}", headers=headers_a).status_code == 204

        with SessionLocal() as db:
            volume = db.get(StorageVolume, pc["storage_volume_id"])
            assert volume is not None
            assert volume.persistent is True
            assert volume.size_gb == 1024
