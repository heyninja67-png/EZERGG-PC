from datetime import datetime
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from .models import CloudPCStatus


class RegisterInput(BaseModel):
    email: EmailStr
    display_name: str = Field(min_length=2, max_length=100)
    password: str = Field(min_length=10, max_length=128)


class LoginInput(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    email: EmailStr
    display_name: str
    is_admin: bool


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class CloudPCCreate(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    os_image: str = Field(pattern=r"^windows-11(-pro|-enterprise)?$")
    cpu_cores: int = Field(ge=2, le=64)
    ram_gb: int = Field(ge=8, le=256)
    storage_gb: int = Field(ge=1024, le=8192)
    gpu_sku: str = Field(default="none", min_length=2, max_length=80)


class CloudPCOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    os_image: str
    cpu_cores: int
    ram_gb: int
    storage_gb: int
    gpu_sku: str
    status: CloudPCStatus
    provider_name: str
    storage_volume_id: str | None
    is_demo: bool
    last_error: str | None
    created_at: datetime
    updated_at: datetime


class CapacityItem(BaseModel):
    id: str
    label: str
    available: bool
    verified: bool
    details: str | None = None


class CapacityOut(BaseModel):
    mode: str
    verified: bool
    region: str
    cpu_profiles: list[int]
    ram_profiles: list[int]
    storage_profiles: list[int]
    os_images: list[str]
    gpu_profiles: list[CapacityItem]
    message: str


class ConnectOut(BaseModel):
    connected: bool
    stream_url: str | None = None
    message: str
