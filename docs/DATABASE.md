# Banco de dados

MVP usa SQLAlchemy 2 e PostgreSQL. `AUTO_CREATE_DB=true` cria tabelas para dev; não é substituto de migrações.

## Tabelas atuais

### users

`id`, `email` (unique), `display_name`, `password_hash`, `is_admin`, `is_active`, `created_at`.

### cloud_pcs

`id`, `owner_id`, `name`, `os_image`, `cpu_cores`, `ram_gb`, `storage_gb`, `gpu_sku`, `status`, `provider_name`, `provider_instance_id`, `storage_volume_id`, `is_demo`, `last_error`, timestamps.

### storage_volumes

`id`, `owner_id`, `size_gb`, `provider_name`, `provider_volume_id`, `status`, `persistent`, `encrypted`, `created_at`.

O volume é independente de `CloudPC`; a FK usa `RESTRICT`, permitindo manter o volume quando o registro/compute é excluído. Na entrega inicial, o registro do volume é metadado no provider demo, não um disco de bloco físico.

### audit_logs

`id`, `actor_user_id`, `action`, `resource_id`, `detail`, `created_at`.

## Próximas tabelas

`cloud_pc_configurations`, `operating_system_images`, `gpu_profiles`, `cpu_profiles`, `ram_profiles`, `providers`, `regions`, `hosts`, `host_capacity_leases`, `vm_instances`, `sessions`, `snapshots`, `backups`, `subscriptions`, `payments`, `invoices`, `support_tickets`, `agent_certificates`, `provisioning_jobs` e `outbox_events`.

## Regras

- Usar UUID para IDs públicos.
- Indexar todas as FKs e filtros por owner.
- Guardar dinheiro em unidades mínimas (centavos), nunca float.
- Não guardar tokens de sessão de streaming em texto puro.
- Não guardar chaves Windows nem senhas de VM no banco.
- Aplicar retenção e exclusão também em backups e volumes órfãos.
