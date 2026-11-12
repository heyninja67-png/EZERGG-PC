# Infraestrutura real

## MVP físico recomendado

- 1 servidor dedicado com virtualização Intel VT-x/AMD-V e IOMMU se usar passthrough.
- CPU e RAM com reserva explícita para o host; não vender toda a memória física.
- NVMe/SSD de alta endurance para volumes de VM.
- GPU cujo modelo, firmware, driver, hypervisor e licença estejam certificados em conjunto.
- Rede pública protegida por firewall, rede privada de gerenciamento e rede de VM separada.
- Backup independente do host; armazenamento primário sozinho não é backup.
- UPS e monitoramento de temperatura/energia para bare metal.

## KVM/libvirt

O adapter atual usa `virsh nodeinfo` e operações `start`, `shutdown` e `reboot` para domínios existentes. Não executa `virsh define`, não clona imagem Windows, não anexa GPU e não manipula pool de storage ainda.

Para provisionamento real, desenvolver e revisar:

1. `HostInventory`: CPU sockets/cores, memória, NUMA, IOMMU, PCI devices, GPU/VRAM e storage pools.
2. `CapacityLease`: reservar recursos atomicamente antes de aceitar criação.
3. `ImageCatalog`: hash, edição Windows, licença, drivers e versão aprovados.
4. `VolumeProvider`: criar qcow2/LVM/RBD/ZFS/volume cloud persistente com quota.
5. `DomainBuilder`: gerar XML libvirt com CPU/memória/rede/disco e dispositivos permitidos.
6. `WindowsBootstrap`: mídia unattended e drivers VirtIO assinados; nunca embutir chaves de produto.
7. `AgentEnrollment`: certificado por instância e registro de identidade.
8. `HealthReconciler`: conferir `virsh domstate`, volumes anexados, agente e conectividade.
9. `Cleanup`: excluir compute sem remover volume persistente; exclusão de volume exige ação explícita e período de retenção.

## Provider abstractions

`InfrastructureProvider` define `capacity`, `create`, `start`, `stop`, `restart`, `delete`. Adapter de produção deve declarar capacidades verificadas e implementar todas as operações com timeouts, retries idempotentes e audit trail.

## Hypervisor e GPU

- KVM: passthrough PCIe exige IOMMU e grupos viáveis.
- vGPU/GPU partitioning: disponível apenas para hardware, driver, hypervisor e licenças compatíveis.
- GPU física deve ser anunciada pelo inventário depois de confirmar VRAM, perfis, exclusividade e reservas.
- Não usar nome de produto como prova de disponibilidade.

## Não assumir

Não presumir que uma VM de cloud comum oferece passthrough de GPU, nested virtualization, NVMe persistente ou Windows desktop multiusuário. Conferir contrato e SKU do provedor.
