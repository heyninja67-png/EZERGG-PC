# NEVOZ SETUP 0.6 — arquitetura

## O que esta versão faz

- O aplicativo Android deixa de tratar um perfil local como se fosse um PC criado.
- O app configura uma URL HTTPS, pareia o dispositivo com um código de uso administrativo e recebe um token revogável por dispositivo.
- A API mantém o inventário de máquinas em um volume persistente no servidor.
- O provider padrão é `none`: ele responde de forma explícita que o provisionamento está indisponível. Não inventa GPU, IP, Windows ou estado ONLINE.
- Há um adaptador inicial para Proxmox VE que clona um template Windows, aplica CPU/RAM, aumenta o disco configurado e inicia a VM.
- A conexão remota só aparece quando `NEVOZ_CONNECTION_URL_TEMPLATE` aponta para um gateway RDP/HTML5 que você tenha implantado e protegido.

## O que ainda depende da infraestrutura do operador

1. Um servidor Proxmox VE com recursos de CPU, RAM, armazenamento e rede.
2. Templates separados para as edições Windows que serão ofertadas, com licença válida, VirtIO drivers, QEMU Guest Agent e acesso remoto já preparado.
3. GPU física/vGPU instalada e configurada no host. PCI passthrough depende de suporte IOMMU do hardware, grupos IOMMU e configuração do host.
4. Um gateway remoto seguro, por exemplo Apache Guacamole ou outro serviço compatível, exposto via HTTPS.
5. DNS, TLS válido, firewall, monitoramento, backups e política de uso/custos.

O APK e o backend não podem criar hardware que o host não possui. Opções no catálogo são limites/configuração do produto, não garantia de capacidade do servidor.

## Segurança

- Não coloque o token do Proxmox, segredo de API ou pairing code dentro do APK ou no Git.
- `.env` é ignorado pelo Git. Preencha `.env.example` em um arquivo `.env` privado no servidor.
- Use um token Proxmox com privilégios mínimos, restrito ao pool/nó/VMs necessárias.
- Use certificado TLS confiável no endpoint Proxmox. Não desabilite a verificação TLS em produção.
- O pairing code é um segredo administrativo de uso inicial. Gere um código forte e troque-o após parear os dispositivos desejados.
- Cada app recebe um token de dispositivo; no MVP ele fica no armazenamento privado do app. Revogue dispositivos removendo o respectivo hash em `/data/nevoz.json` e reiniciando o serviço.
- Exponha a API atrás de um reverse proxy HTTPS, com rate limiting adicional, firewall e logs protegidos. O Compose só publica a porta em `127.0.0.1`.

## Estado

`running` significa que o hypervisor reporta a VM como em execução; não prova que o Windows concluiu o boot nem que o desktop está pronto. A disponibilidade do botão Conectar depende de um gateway configurado.
