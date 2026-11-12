# API EZERGG PC

Base local: `http://localhost:8000/api/v1`. A especificação OpenAPI fica em `/docs`.

## Autenticação

Todos os endpoints de Cloud PC e `/capacity` exigem `Authorization: Bearer <token>`.

| Método | Rota | Descrição |
|---|---|---|
| POST | `/auth/register` | Cadastro e emissão de token |
| POST | `/auth/login` | Login e emissão de token |
| GET | `/auth/me` | Perfil autenticado |
| GET | `/capacity` | Perfis de recursos do provider |
| GET | `/cloud-pcs` | Lista apenas PCs do usuário |
| POST | `/cloud-pcs` | Solicita criação conforme catálogo do provider |
| POST | `/cloud-pcs/{id}/start` | Inicia a instância vinculada |
| POST | `/cloud-pcs/{id}/stop` | Desliga a instância vinculada |
| POST | `/cloud-pcs/{id}/restart` | Reinicia a instância vinculada |
| POST | `/cloud-pcs/{id}/connect` | Entrada futura para ticket do streaming |
| DELETE | `/cloud-pcs/{id}` | Exclui registro quando desligado; volume não é apagado automaticamente |
| GET | `/health` | Health check sem autenticação |

## Criar Cloud PC

```json
{
  "name": "Meu EZERGG PC",
  "os_image": "windows-11",
  "cpu_cores": 4,
  "ram_gb": 16,
  "storage_gb": 1024,
  "gpu_sku": "none"
}
```

O backend confere CPU, RAM, storage, imagem e GPU contra `provider.capacity()`. O mock publica perfis ilustrativos com `verified=false`. O libvirt inicial não anuncia imagens de Windows e, portanto, não permite criar VMs.

## Capacidade

A resposta inclui `mode`, `verified`, região, perfis e mensagem operacional. Clientes devem ocultar opções não retornadas e apresentar `verified=false` como não confirmado.

## Erros

- `401`: token inválido/expirado ou conta inativa.
- `404`: recurso inexistente ou que não pertence ao usuário.
- `409`: estado atual não permite a operação.
- `422`: configuração não aceita pelo catálogo.
- `503`: provider/gateway não disponível ou recurso não configurado.
- `501`: integração ainda não implementada.

## Segurança e evolução

Não expor `provider_instance_id` ou URL de streaming como credencial. A integração futura precisa trocar o token JWT de usuário por um ticket efêmero, restrito ao PC e à sessão, com expiração curta e revogação. Adicionar quotas e rate limiting antes de abrir cadastro público.
