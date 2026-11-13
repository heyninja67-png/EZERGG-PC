# Histórico de versões

## 0.7.0 — NEVOZ Provider próprio

- Refaz a interface Android com fundo preto, detalhes ciano e a logo NEVOZ fornecida pelo proprietário.
- Remove os campos de URL, chave, IP/porta e código de pareamento da interface do usuário.
- Adiciona registro local automático da instalação do Android.
- Substitui a integração Proxmox por execução local de KVM/QEMU/libvirt.
- Persiste cada Cloud PC em overlay QCOW2 no host.
- Integra console remoto noVNC em WebView com ticket temporário e ponte WebSocket para VNC de loopback.
- Adiciona instalador Linux, unidade systemd, exemplo Nginx e documentação de implantação.
- Mantém Windows 11, Pro e Enterprise, opções de CPU/RAM/armazenamento e GPU passthrough configurável.

Limites: requer host físico/dedicado Linux x86_64 com KVM, domínio HTTPS, imagens-base Windows licenciadas e recursos físicos. O ZIP é o código-fonte; não inclui ISO/Windows, licença, servidor público nem APK compilado.
