from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .config import settings
from .database import Base, engine
from . import models  # noqa: F401 - register SQLAlchemy models
from .routers import auth, cloud_pcs


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.environment.lower() == "production":
        if len(settings.jwt_secret.encode("utf-8")) < 32 or "CHANGE-ME" in settings.jwt_secret:
            raise RuntimeError("JWT_SECRET precisa ser um segredo aleatório de pelo menos 32 bytes em produção.")
        if settings.auto_create_db:
            raise RuntimeError("AUTO_CREATE_DB deve ser false em produção; aplique migrations antes de iniciar.")
    if settings.auto_create_db:
        Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    description="Control plane inicial do EZERGG PC. O provider mock é explicitamente simulado.",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)
app.include_router(auth.router, prefix=settings.api_prefix)
app.include_router(cloud_pcs.router, prefix=settings.api_prefix)


@app.get("/health", tags=["operations"])
def health():
    return {"status": "ok", "service": "ezergg-api", "environment": settings.environment}
