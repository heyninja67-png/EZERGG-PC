# Deploy e desenvolvimento

## Ambiente local

1. Copiar `.env.example` para `.env`.
2. Definir senha do PostgreSQL e `JWT_SECRET` exclusivos.
3. Executar `docker compose up --build -d`.
4. Rodar frontend com `cd apps/web && npm install && npm run dev`.
5. Abrir `/docs` para conferir a API.

## Deploy do backend

- Construir imagem a partir de `apps/api/Dockerfile`.
- Injetar segredos no secret manager do ambiente.
- Usar PostgreSQL gerenciado com backups/PITR e Redis protegido por rede privada.
- Configurar TLS no reverse proxy.
- Definir CORS apenas para domínios reais.
- Desabilitar `AUTO_CREATE_DB` após migrar para Alembic.
- Não colocar o socket libvirt em container exposto; separar worker de virtualização em host restrito.

## Deploy do frontend


## Android


## Health checks

- API: `/health`.
- PostgreSQL: `pg_isready`.
- Redis: `redis-cli ping`.
- Produção: acrescentar `/ready` com teste de DB/provider e métricas de fila.
