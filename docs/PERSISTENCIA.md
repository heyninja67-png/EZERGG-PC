# Persistência do NEVOZ SETUP

## O que já fica salvo nesta versão
- Os perfis de Cloud PC criados no Android são armazenados em SQLite no próprio aplicativo.
- O campo de progresso/checkpoint de cada perfil também é salvo localmente e continua disponível após fechar/reabrir o app.
- Cada perfil recebe um `volume_id` estável. Ao configurar a API HTTPS, o app sincroniza os metadados e checkpoints.
- A API grava perfis, referências de discos e checkpoints em SQLite dentro do volume Docker `nevoz_setup_persistent_data`.

## O que ainda depende de um provedor real
A versão atual **não cria uma VM Windows** nem um disco virtual de blocos real. A tabela `persistent_disks` mantém a identidade e os metadados do disco pretendido (`state=metadata_only`), não os arquivos do Windows.

Para salvar os arquivos e o estado de um Windows Cloud PC de verdade, o adapter do provedor precisa:
1. Criar um disco persistente separado da VM.
2. Criar a VM Windows e anexar esse disco como disco de sistema/dados.
3. Em `stopVm`, desligar a VM sem destruir o disco.
4. Em `startVm`, iniciar a VM e reanexar o mesmo disco.
5. Só excluir o disco em um fluxo de exclusão destrutiva com confirmação explícita.

A API retorna `PROVIDER_NOT_CONFIGURED` para ligar/desligar até que esse adapter seja implementado e configurado. Isso evita mostrar falsamente que existe um Windows em execução.

## Implantação da API
- Faça deploy do `server/` em um host com Docker.
- Mantenha o volume Docker `nevoz_setup_persistent_data`.
- Publique a API atrás de HTTPS (reverse proxy com certificado válido).
- No app, abra Configurações e informe a URL HTTPS.
- Não exponha a porta da API diretamente à internet sem HTTPS, autenticação e regras de firewall.

## Limite importante
SQLite local protege os perfis e checkpoints do app, mas não substitui um disco persistente conectado ao Windows. O conteúdo dos arquivos dentro de uma VM só será preservado quando o provedor real oferecer esse armazenamento.

## Segurança da sincronização
- A API exige `Authorization: Bearer <API_TOKEN>` em todos os endpoints `/api`.
- Gere um token aleatório forte no servidor; não o publique no GitHub nem em screenshots.
- O app aceita somente URL HTTPS para sincronização; ao abrir, baixa perfis remotos e mescla sem substituir checkpoints locais mais recentes.
- O campo de checkpoint guarda uma nota de progresso e histórico no servidor; ele não faz cópia automática dos arquivos abertos dentro de uma VM Windows.
- O APK não contém token padrão. Cada instalação recebe a URL e o token nas Configurações.
- A API inicial é destinada a teste privado; antes de disponibilizar publicamente, acrescente autenticação individual por usuário, cotas e isolamento de dados.

## Comandos de preparação da API
No servidor de hospedagem:
```bash
cp .env.example .env
openssl rand -hex 32
# Cole o resultado como API_TOKEN em .env (mantenha o arquivo privado).
docker compose up -d --build
```
Não envie `.env` ao repositório.
