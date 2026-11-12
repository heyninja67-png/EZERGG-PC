# Roadmap

## Fase 1 — Base MVP (esta entrega)

- [x] Monorepo web/API.
- [x] Cadastro/login JWT.
- [x] PostgreSQL via Compose.
- [x] Registro de Cloud PC e volume persistente desacoplado.
- [x] Catálogo retornado pelo backend.
- [x] Provider mock claramente identificado.
- [x] Adapter inicial libvirt para inspeção e lifecycle de domínios existentes.
- [x] Dashboard responsivo.
- [x] Workflow CI e APK debug.
- [ ] Provisionamento de Windows em host real.
- [ ] Criar/anexar volume físico e confirmar persistência.
- [ ] Gateway de streaming com ticket de sessão.

## Fase 2 — Primeiro host real

- [ ] Inventário de hardware e leases de capacidade.
- [ ] Storage pool e volume block provider.
- [ ] Imagem Windows autorizada, drivers e bootstrap.
- [ ] Domain XML/VM create e cleanup seguro.
- [ ] Agente EZERGG assinado e autenticado.
- [ ] Streaming RDP via gateway.
- [ ] Testes de desligamento, reconexão e persistência após recriar VM.

## Fase 3 — Operação

- [ ] Scheduler multi-host.
- [ ] Snapshots, backups e restore verificados.
- [ ] Admin/RBAC e auditoria completa.
- [ ] Billing e quotas.
- [ ] GPU passthrough/vGPU certificado.
- [ ] Métricas e alertas de produção.

## Fase 4 — Escala

- [ ] Multi-região e disaster recovery.
- [ ] Aplicativo Android dedicado com gamepad/transferências.
- [ ] Cliente Windows/macOS.
- [ ] Multi-cloud e bare metal.
- [ ] Marketplace e autoscaling.

## Critérios de saída do MVP real

Não anunciar cloud PC de produção até: criar VM real, iniciar/desligar, acessar por gateway, provar que Windows/programas/arquivos sobrevivem a stop e recriação de compute, testar isolamento entre usuários, executar restore e verificar direitos de licenciamento.
