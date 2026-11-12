from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session
from ..database import get_db
from ..dependencies import get_current_user
from ..models import User, CloudPC, CloudPCStatus, StorageVolume, AuditLog
from ..schemas import CloudPCCreate, CloudPCOut, CapacityOut, ConnectOut
from ..providers.factory import get_provider
from ..providers.base import ProvisionRequest, ProviderError
from ..config import settings

router = APIRouter(tags=["cloud-pcs"])


def _owned_pc(db: Session, pc_id: str, user_id: str) -> CloudPC:
    pc = db.scalar(select(CloudPC).where(CloudPC.id == pc_id, CloudPC.owner_id == user_id))
    if not pc:
        raise HTTPException(status_code=404, detail="Cloud PC não encontrado.")
    return pc


def _provider_for(pc: CloudPC):
    provider = get_provider()
    if pc.provider_name != provider.name:
        raise HTTPException(status_code=409, detail="O Cloud PC pertence a outro provider. Migração não está habilitada.")
    return provider


@router.get("/capacity", response_model=CapacityOut)
def capacity(user: User = Depends(get_current_user)):
    try:
        return get_provider().capacity()
    except ProviderError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.get("/cloud-pcs", response_model=list[CloudPCOut])
def list_cloud_pcs(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return list(db.scalars(select(CloudPC).where(CloudPC.owner_id == user.id).order_by(CloudPC.created_at.desc())))


@router.post("/cloud-pcs", response_model=CloudPCOut, status_code=status.HTTP_201_CREATED)
def create_cloud_pc(payload: CloudPCCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    provider = get_provider()
    available = provider.capacity()
    if payload.cpu_cores not in available.get("cpu_profiles", []):
        raise HTTPException(status_code=422, detail="A configuração de CPU não está disponível neste provider.")
    if payload.ram_gb not in available.get("ram_profiles", []):
        raise HTTPException(status_code=422, detail="A configuração de RAM não está disponível neste provider.")
    if payload.storage_gb not in available.get("storage_profiles", []):
        raise HTTPException(status_code=422, detail="A configuração de armazenamento não está disponível neste provider.")
    if payload.os_image not in available.get("os_images", []):
        raise HTTPException(status_code=422, detail="A imagem de sistema operacional não está disponível neste provider.")
    gpu = next((item for item in available.get("gpu_profiles", []) if item.get("id") == payload.gpu_sku and item.get("available")), None)
    if not gpu:
        raise HTTPException(status_code=422, detail="O perfil de GPU não está disponível neste provider.")
    volume = StorageVolume(owner_id=user.id, size_gb=payload.storage_gb, provider_name=provider.name,
                           status="DEMO_METADATA" if provider.is_demo else "PENDING", persistent=True, encrypted=False)
    db.add(volume)
    db.flush()
    pc = CloudPC(
        owner_id=user.id, name=payload.name.strip(), os_image=payload.os_image,
        cpu_cores=payload.cpu_cores, ram_gb=payload.ram_gb, storage_gb=payload.storage_gb,
        gpu_sku=payload.gpu_sku, status=CloudPCStatus.CREATING,
        provider_name=provider.name, is_demo=provider.is_demo, storage_volume_id=volume.id,
    )
    db.add(pc)
    db.flush()
    try:
        instance = provider.create(ProvisionRequest(
            name=pc.name, os_image=pc.os_image, cpu_cores=pc.cpu_cores,
            ram_gb=pc.ram_gb, storage_gb=pc.storage_gb, gpu_sku=pc.gpu_sku,
            owner_id=user.id, cloud_pc_id=pc.id,
        ))
        pc.provider_instance_id = instance.instance_id
        pc.status = CloudPCStatus(instance.status)
    except ProviderError as exc:
        db.rollback()
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    db.add(AuditLog(actor_user_id=user.id, action="cloudpc.created", resource_id=pc.id,
                    detail=f"provider={provider.name};demo={provider.is_demo}"))
    db.commit()
    db.refresh(pc)
    return pc


@router.post("/cloud-pcs/{pc_id}/start", response_model=CloudPCOut)
def start_cloud_pc(pc_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    pc = _owned_pc(db, pc_id, user.id)
    if pc.status == CloudPCStatus.RUNNING:
        return pc
    if not pc.provider_instance_id:
        raise HTTPException(status_code=409, detail="Este Cloud PC não possui uma instância provisionada.")
    try:
        instance = _provider_for(pc).start(pc.provider_instance_id)
        pc.status = CloudPCStatus(instance.status)
        pc.last_error = None
    except ProviderError as exc:
        pc.last_error = str(exc)
        db.commit()
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    db.add(AuditLog(actor_user_id=user.id, action="cloudpc.started", resource_id=pc.id))
    db.commit(); db.refresh(pc)
    return pc


@router.post("/cloud-pcs/{pc_id}/stop", response_model=CloudPCOut)
def stop_cloud_pc(pc_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    pc = _owned_pc(db, pc_id, user.id)
    if pc.status == CloudPCStatus.STOPPED:
        return pc
    if not pc.provider_instance_id:
        raise HTTPException(status_code=409, detail="Este Cloud PC não possui uma instância provisionada.")
    try:
        instance = _provider_for(pc).stop(pc.provider_instance_id)
        pc.status = CloudPCStatus(instance.status)
        pc.last_error = None
    except ProviderError as exc:
        pc.last_error = str(exc)
        db.commit()
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    db.add(AuditLog(actor_user_id=user.id, action="cloudpc.stopped", resource_id=pc.id))
    db.commit(); db.refresh(pc)
    return pc


@router.post("/cloud-pcs/{pc_id}/restart", response_model=CloudPCOut)
def restart_cloud_pc(pc_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    pc = _owned_pc(db, pc_id, user.id)
    if not pc.provider_instance_id:
        raise HTTPException(status_code=409, detail="Este Cloud PC não possui uma instância provisionada.")
    try:
        instance = _provider_for(pc).restart(pc.provider_instance_id)
        pc.status = CloudPCStatus(instance.status)
        pc.last_error = None
    except ProviderError as exc:
        pc.last_error = str(exc)
        db.commit()
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    db.add(AuditLog(actor_user_id=user.id, action="cloudpc.restarted", resource_id=pc.id))
    db.commit(); db.refresh(pc)
    return pc


@router.post("/cloud-pcs/{pc_id}/connect", response_model=ConnectOut)
def connect_cloud_pc(pc_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    pc = _owned_pc(db, pc_id, user.id)
    if pc.status not in (CloudPCStatus.RUNNING, CloudPCStatus.DISCONNECTED, CloudPCStatus.CONNECTED):
        raise HTTPException(status_code=409, detail="Inicie o Cloud PC antes de conectar.")
    if not settings.streaming_url:
        raise HTTPException(status_code=503, detail="Gateway de streaming não configurado. Configure um gateway remoto com autenticação por sessão antes de habilitar conexões.")
    # Never expose a raw shared gateway URL as an authenticated session. A signed,
    # short-lived gateway ticket must be implemented by the streaming adapter.
    raise HTTPException(status_code=501, detail="A URL do gateway está configurada, mas a emissão segura de tickets de sessão ainda não foi implementada.")


@router.delete("/cloud-pcs/{pc_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_cloud_pc(pc_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    pc = _owned_pc(db, pc_id, user.id)
    if pc.status != CloudPCStatus.STOPPED:
        raise HTTPException(status_code=409, detail="Desligue o Cloud PC antes de excluí-lo.")
    try:
        _provider_for(pc).delete(pc.provider_instance_id or "")
    except ProviderError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    db.add(AuditLog(actor_user_id=user.id, action="cloudpc.deleted", resource_id=pc.id))
    db.delete(pc); db.commit()
    return None
