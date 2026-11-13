# NEVOZ SETUP 0.7

Aplicativo Android de gerenciamento de Cloud PCs e provedor próprio baseado em KVM/QEMU + libvirt.

## O que mudou

- Interface escura em preto e ciano, com a logo NEVOZ real no cabeçalho e no ícone do app.
- Removidos os campos de URL, código de pareamento e configuração de API da tela do usuário.
- O app registra sua instalação automaticamente usando identidade aleatória guardada no armazenamento privado do Android.
- O backend executa o ciclo de vida das VMs diretamente no host Linux por `virsh` e `qemu-img`; não usa Proxmox nem API de Cloud PC de terceiros.
- Discos de usuário são overlays QCOW2 persistentes, separados do app.
- Catálogo de Windows 11, vCPU, RAM, SSD de até 2 TB e perfis de GPU definidos pelo host.
- Serviço `systemd` com reinicialização automática.

## Componentes

```text
NEVOZ Android
   │ HTTPS (endereço definido na compilação)
   ▼
NEVOZ Provider API (Node.js)
   │ libvirt / qemu-img local
   ▼
KVM + QEMU no servidor x86_64
   │
   ├── Windows 11
   ├── Windows 11 Pro
   └── Windows 11 Enterprise
```

## Importante

O APK não é um servidor Cloud PC. Para criar Windows de verdade é necessário um host físico/dedicado Linux x86_64 com KVM, RAM, SSD, rede e imagens-base Windows licenciadas. Um celular Android com Termux não substitui esse hardware.

O app não pede API key, IP, porta nem código de pareamento ao usuário final. O endereço central HTTPS do serviço é configurado uma vez pelo administrador na compilação do APK (`NEVOZ_API_BASE_URL`); sem um host/domínio real, ainda não existe um serviço ao qual conectar. O serviço local usa `127.0.0.1:8080` atrás do Nginx; o usuário final acessa somente o domínio HTTPS incorporado ao aplicativo.

A conexão visual também está integrada: o QEMU mantém o VNC preso a `127.0.0.1`, e a API fornece um túnel WebSocket autenticado por ticket temporário para o cliente noVNC embutido na tela do app. Não é necessário copiar endereço, porta ou senha de VNC/RDP. O Nginx precisa encaminhar WebSockets como no exemplo incluído.

## Começar

1. Leia [`docs/PROVEDOR-NEVOZ.md`](docs/PROVEDOR-NEVOZ.md).
2. Instale o provedor no host Linux usando `sudo bash deploy/install-host.sh`.
3. Prepare as imagens-base Windows licenciadas e ajuste `/etc/nevoz-provider.env`.
4. Configure domínio + HTTPS pelo Nginx e deixe `NEVOZ_PUBLIC_BASE_URL` com o mesmo domínio.
5. Compile o APK com `NEVOZ_API_BASE_URL=https://api.seudominio.com`. O valor é incorporado ao APK; não é digitado pelo usuário.
6. Para GitHub Actions, cadastre `NEVOZ_API_BASE_URL` em Settings → Secrets and variables → Actions → Variables do repositório. O workflow falha de propósito se essa URL não estiver definida.

## Build Android

```bash
NEVOZ_API_BASE_URL=https://api.seudominio.com gradle assembleDebug
```

Saída: `app/build/outputs/apk/debug/app-debug.apk`.

## Testes do backend

Requer Node.js 22 ou superior:

```bash
cd server
npm test
```
