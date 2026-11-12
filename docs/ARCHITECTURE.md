# Arquitetura EZERGG PC

## Princípios

1. **Compute separado de storage:** desligar uma VM não deve apagar volumes de usuário.
2. **Provider adapter:** regras de produto não devem chamar APIs específicas de cloud ou `virsh` diretamente.
3. **Capacidade autoritativa:** o frontend só oferece perfis retornados por `GET /capacity`.
4. **Estado confirmado:** a aplicação não deve marcar uma VM como ligada sem confirmação do provider.
5. **Isolamento por proprietário:** todas as consultas de Cloud PC filtram `owner_id` no backend.
6. **Sem simulação silenciosa:** provider de demonstração deve estar identificado e `verified=false`.

## Componentes

- `apps/web`: React/Vite responsivo. Capacitor empacota o build como Android WebView.
- `apps/api`: FastAPI, JWT, SQLAlchemy e providers.
- PostgreSQL: contas, Cloud PCs, volumes e auditoria.
- Redis: reservado para filas, locks, cache e presença; ainda não consumido pelos endpoints MVP.
- Provider: `MockProvider` ou `LibvirtProvider`.
- Streaming gateway: integração externa futura que deve emitir ticket efêmero por sessão.

## Control plane vs data plane

**Control plane:** API, autenticação, scheduler, provisionamento, auditoria e status.

**Data plane:** hypervisors, discos de bloco, rede da VM, agente Windows e streaming.

O MVP implementa uma parte do control plane. O data plane real é uma dependência operacional, não um componente simulado escondido.

## Modelo de estado

`CREATING → STOPPED → STARTING → RUNNING → STOPPING → STOPPED`.

`CONNECTED` e `DISCONNECTED` serão controlados pela integração de sessão; não são atribuídos pelo mock neste MVP. `FAILED` guarda a última falha observada.

Toda operação mutável deve evoluir para ser idempotente, receber uma chave de operação e persistir eventos/outbox antes de executar trabalho assíncrono. O endpoint síncrono atual é uma primeira implementação, não um scheduler distribuído.

## Persistência

`StorageVolume` é uma entidade independente de `CloudPC`. A exclusão do registro Cloud PC não apaga automaticamente o volume; a FK usa `RESTRICT`. O adaptador físico futuro deverá criar um volume de bloco, anexá-lo à VM, confirmar flush/desmontagem e manter seu ciclo de vida separado.

Separar ao menos:

- volume de sistema (Windows, drivers e programas);
- volume de dados (perfil, documentos e projetos), quando a estratégia de imagem permitir;
- snapshots e backups como cópias versionadas fora do único domínio de falha.

## Próxima evolução

- Alembic + migrations;
- fila e worker de provisionamento;
- scheduler de hosts com reservas/leases;
- adapter de block storage;
- template Windows com instalação unattended licenciada;
- agente Windows com certificado por VM;
- gateway RDP/WebRTC com ticket curto e revogável;
- telemetria e reconciliação periódica do estado desejado vs estado observado.
