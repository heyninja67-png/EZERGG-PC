# Segurança

## Implementado no MVP

- Senhas armazenadas com `scrypt`, salt aleatório e comparação em tempo constante.
- JWT com expiração.
- Rotas de Cloud PC verificam usuário proprietário em cada operação.
- CORS configurável.
- SQLAlchemy com parâmetros vinculados.
- Auditoria básica de cadastro, login e operações de Cloud PC.
- Segredos via variáveis de ambiente; `.env` ignorado pelo Git.
- O frontend não guarda senha, somente o token de acesso.

## Obrigatório antes de produção

1. Usar HTTPS em todos os serviços e HSTS no gateway.
2. Gerar `JWT_SECRET` aleatório, exclusivo por ambiente e rotacionável. Nunca usar valor de exemplo.
3. Implementar refresh token rotativo, revogação, MFA/WebAuthn e proteção contra brute force.
4. Adicionar rate limiting por IP/conta e CAPTCHA adaptativo no cadastro.
5. Substituir `create_all` por migrations revisadas.
6. Criar RBAC administrativo real, trilhas de auditoria imutáveis e aprovação de ações destrutivas.
7. Executar hypervisor/worker com privilégio mínimo; nunca expor socket libvirt à API pública.
8. Usar mTLS ou identidade de workload entre API, scheduler, agente e streaming.
9. Separar redes de controle, storage e dados de usuários; aplicar firewall por VM.
10. Criptografar volumes e backups com chaves gerenciadas e rotação documentada.
11. Tratar upload/download com antivírus, limites, URLs assinadas curtas e isolamento.
12. Aplicar política de retenção e exclusão verificável a volumes órfãos.
13. Fazer threat modeling e pentest independente antes de aceitar pagamentos.

## Não implementado

MFA, Google OAuth, billing, RBAC completo, isolamento de rede por VM, gateway de sessão, emissão de certificados do agente, antivírus de upload e trilha append-only.

## Modelo de ameaça resumido

Atacantes podem tentar acessar PCs alheios, roubar tokens, explorar o agente, abusar da API para consumir GPU, escapar da VM, atacar o hypervisor ou obter dados em volumes/backups. A fronteira mais crítica é entre tenant e infraestrutura. Nunca executar comandos arbitrários recebidos do navegador dentro do host.
