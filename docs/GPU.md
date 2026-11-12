# Catálogo e alocação de GPU

O catálogo vem do provider. A interface não deve codificar nomes de placas que não estão presentes no inventário.

## Perfis futuros

- Basic: desktop e tarefas leves.
- Gaming: jogos e criação.
- Pro: 3D, CAD e edição.
- High-End: workloads exigentes, condicionado a disponibilidade.

Essas categorias são rótulos de produto, não promessa de uma placa específica.

## Inventário necessário

`vendor`, `model`, `pci_bdf`, `vram_bytes`, `driver_version`, `supported_modes`, `available_profiles`, `host_id`, `numa_node`, `iommu_group`, `license_state`, `health`, `reserved_memory`.

## Scheduler

Reservar GPU e memória de vídeo como lease atômica. Avaliar compatibilidade de driver, NUMA, encoder, vGPU profile, isolamento e licença. Se qualquer condição falhar, não oferecer o perfil.

O adaptador `mock` contém um perfil didático `GPU Basic (demonstração)` com `verified=false`. Ele nunca representa hardware físico. O adaptador libvirt inicial não anuncia GPU.
