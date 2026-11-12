# Administração

O modelo `User` já possui `is_admin`, mas ainda não existe painel `/admin` nem endpoints administrativos. Não conceda esse atributo por cadastro público.

## Escopo planejado

- lista de usuários e suspensão;
- catálogo de GPU/CPU/RAM e capacidade de hosts;
- jobs de provisionamento e falhas;
- regiões, volumes órfãos, snapshots e backups;
- métricas de consumo, planos, pagamentos e tickets;
- logs de auditoria e alertas operacionais.

## Requisitos

- RBAC com papéis separados (support, operator, billing, infra-admin, security-admin);
- MFA obrigatório;
- trilha de auditoria para leitura sensível e mutações;
- aprovação dupla para exclusão de disco/backup e ações de host;
- não permitir que suporte visualize arquivos pessoais do usuário;
- segregar a console de infra da aplicação pública.
