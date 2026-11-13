# Configuração do Proxmox VE

## 1. Preparar o ambiente

- Instale e atualize Proxmox VE em hardware dedicado.
- Configure IOMMU/VT-d/AMD-Vi apenas se for usar passthrough; valide grupos IOMMU e vincule o dispositivo à pilha VFIO conforme a documentação oficial do Proxmox.
- Configure storage, bridge de rede e backups.
- Prepare uma VM-template por edição Windows oferecida. Instale Windows a partir de mídia licenciada, VirtIO drivers, QEMU Guest Agent e o software de acesso remoto/gateway necessário. Converta a VM em template.
- Para GPU passthrough, configure o host e o hardware antes. Uma GPU física passada integralmente a uma VM não fica disponível simultaneamente ao host ou a outras VMs. Planeje o inventário/exclusividade; vGPU exige hardware, licenciamento e suporte específicos.

## 2. Criar token API

Crie um usuário/token exclusivo para NEVOZ com privilégios mínimos necessários para clonar, configurar, iniciar, consultar e excluir VMs no pool/nó apropriado. Não use o token root.

## 3. Configurar servidor

Copie `.env.example` para `.env` no servidor. Preencha:

- `NEVOZ_PAIRING_CODE`: segredo longo e aleatório para parear dispositivos.
- `NEVOZ_PROVIDER=proxmox`.
- `PROXMOX_URL`, `PROXMOX_TOKEN_ID`, `PROXMOX_TOKEN_SECRET`, `PROXMOX_NODE`.
- `PROXMOX_TEMPLATE_MAP_JSON`: IDs reais dos templates por edição Windows.
- `PROXMOX_TEMPLATE_DISK_GB`: tamanho base do disco `scsi0` do template.
- `NEVOZ_GPU_PROFILES_JSON`: só os perfis de GPU previamente configurados no host, por exemplo `{"none":{"label":"Sem GPU","hostpci":""},"gpu-a":{"label":"GPU PCIe A","hostpci":"0000:65:00.0,pcie=1"}}`.

O campo `hostpci` é configuração de infraestrutura, nunca informação enviada livremente pelo app. O exemplo é ilustrativo: substitua pelo endereço PCI real e valide o passthrough no host. Uma placa dedicada pode ser atribuída a apenas uma VM de cada vez; este MVP não tem scheduler multi-GPU/concorrência, então não publique um perfil de GPU exclusivo para múltiplas criações simultâneas.

`PROXMOX_STORAGE` e `PROXMOX_BRIDGE` ficam reservados para extensões de perfil; o template deve já possuir os dispositivos de disco/rede corretos.

## 4. Iniciar API

```bash
cp .env.example .env
# edite .env e mantenha-o fora do Git
docker compose up -d --build
docker compose logs -f nevoz-api
curl http://127.0.0.1:8080/health
```

Publique a API com reverse proxy HTTPS e firewall. No Android, informe a URL pública HTTPS e o pairing code. O segredo de Proxmox não é informado no telefone.

## 5. Observações importantes

- O clone usa `full=1`. O template e o storage precisam permitir clone completo.
- Para disco maior, o backend aumenta `scsi0` a partir do tamanho base configurado. Garanta que o template usa o disco `scsi0` como disco principal. A expansão da partição dentro do Windows pode exigir preparação adicional no template/guest.
- Se o provisionamento ficar em `ERROR` depois que o clone foi concluído, o app conserva o VMID para permitir a exclusão pelo backend. Verifique também a VM no Proxmox antes de limpar registros manualmente.
- O provisionamento inicial não descobre automaticamente o IP do Windows. Configure um gateway remoto que saiba localizar a VM e defina `NEVOZ_CONNECTION_URL_TEMPLATE`, contendo `{vmid}`.
- A edição Windows selecionada tem que corresponder ao template e a uma licença válida. O app não ativa Windows nem contorna licenciamento.
