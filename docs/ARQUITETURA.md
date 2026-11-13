# Arquitetura NEVOZ SETUP 0.7

## Fluxo

1. O usuário instala e abre o app. O Android gera um UUID e um segredo de dispositivo; ambos ficam no armazenamento privado do app.
2. O app chama `/api/device/bootstrap` automaticamente. Não há campo de URL, chave API ou código de pareamento na interface.
3. As ações seguem por HTTPS para a API central NEVOZ.
4. A API valida o dispositivo, aplica quotas e guarda o estado em JSON persistente.
5. O `LibvirtProvider` chama `virsh` e `qemu-img` localmente no servidor físico.
6. Cada máquina usa um overlay QCOW2 próprio sobre uma imagem-base Windows licenciada.
7. Para conectar, o app solicita um ticket HMAC de curta duração. O backend abre um túnel WebSocket autenticado até o VNC de loopback da VM e serve noVNC dentro do próprio app; a porta VNC nunca é publicada na internet.

## Separação de responsabilidades

- `app/`: dashboard, catálogo de recursos, gerenciamento e ações.
- `server/src/server.js`: API HTTP, cadastro automático da instalação, autorização, quotas e persistência do catálogo de VMs.
- `server/src/provider.js`: integração local com libvirt/KVM; nenhum serviço Cloud externo é chamado.
- `server/src/store.js`: armazenamento atômico do estado do serviço.
- `deploy/`: serviço systemd, instalador de host e exemplo de proxy HTTPS com WebSocket.

## Persistência

O registro da VM fica em `/var/lib/nevoz-provider/state.json`. Seu disco de usuário fica em `/var/lib/libvirt/images/nevoz/<vm>.qcow2`. O disco-base Windows permanece em `nevoz-templates/`; cada overlay é independente e preserva as gravações da VM. `stop` não apaga o disco. `DELETE` remove o domínio e seu overlay.

## Limites

KVM/libvirt exige um host Linux x86_64 com virtualização de hardware. O recurso GPU é passthrough PCI opcional, dependente de IOMMU/VFIO e de uma GPU física compatível. A interface só oferece perfis que o administrador colocou no catálogo.

A tela remota usa noVNC servido pela própria API. O VNC criado para as VMs escuta apenas em loopback; o WebSocket faz a ponte após validar ticket de curta duração e dono da VM. O proxy HTTPS precisa aceitar Upgrade/WebSocket.
