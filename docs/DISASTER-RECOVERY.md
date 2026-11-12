# Disaster recovery

## Eventos

- VM crash: reconciliar estado no hypervisor e tentar restart controlado.
- host offline: confirmar fencing para impedir split-brain antes de anexar o volume em outro host.
- volume indisponível: não criar VM vazia no lugar silenciosamente; preservar estado e escalar alerta.
- região indisponível: restaurar a partir de backup replicado, sujeito a RPO/RTO.
- banco indisponível: restaurar PostgreSQL com PITR e validar ownership e auditoria.

## Sequência alvo

1. Detectar falha via monitoramento independente.
2. Marcar VM como `FAILED` e bloquear novas ações conflitantes.
3. Confirmar que host antigo está isolado/fenced.
4. Confirmar consistência do volume e snapshot.
5. Alocar host compatível com CPU/GPU/rede/storage.
6. Anexar volume persistente; não recriar disco vazio.
7. Inicializar Windows e validar agente/serviços.
8. Reabrir sessões e informar o usuário.
9. Registrar causa, duração, dados perdidos e resultado.

O MVP não executa recuperação automática. Não habilite failover de volume sem fencing e testes de integridade.
