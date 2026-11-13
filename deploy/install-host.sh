#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ "${EUID}" -ne 0 ]]; then
  echo "Execute como root: sudo bash deploy/install-host.sh" >&2
  exit 1
fi
if [[ "$(uname -m)" != "x86_64" ]]; then
  echo "Este provedor KVM foi preparado para hosts Linux x86_64. Android/Termux/ARM não é um host Windows KVM compatível por padrão." >&2
  exit 1
fi

apt-get update
if ! command -v node >/dev/null 2>&1 || [[ "$(node -p 'Number(process.versions.node.split(".")[0])')" -lt 22 ]]; then
  echo "Instalando Node.js 22..."
  apt-get install -y ca-certificates curl
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
fi
apt-get install -y nodejs qemu-kvm qemu-utils libvirt-daemon-system libvirt-clients ovmf swtpm swtpm-tools dnsmasq-base libvirt-daemon-config-network nginx openssl

if ! id nevoz >/dev/null 2>&1; then
  useradd --system --home-dir /var/lib/nevoz-provider --create-home --shell /usr/sbin/nologin nevoz
fi
usermod -aG libvirt,libvirt-qemu,kvm nevoz

install -d -o nevoz -g libvirt-qemu -m 0750 /var/lib/nevoz-provider
install -d -o nevoz -g libvirt-qemu -m 2770 /var/lib/libvirt/images/nevoz
install -d -o root -g root -m 0755 /var/lib/libvirt/images/nevoz-templates
install -d -o root -g root -m 0755 /opt/nevoz-provider
rm -rf /opt/nevoz-provider/src
cp -a "$ROOT_DIR/server/src" /opt/nevoz-provider/src
cp "$ROOT_DIR/server/package.json" /opt/nevoz-provider/package.json
chown -R root:root /opt/nevoz-provider
(cd /opt/nevoz-provider && npm install --omit=dev)

if [[ ! -f /etc/nevoz-provider.env ]]; then
  install -o root -g root -m 0640 "$ROOT_DIR/.env.example" /etc/nevoz-provider.env
  echo "Arquivo de configuração criado em /etc/nevoz-provider.env"
fi
current_secret="$(sed -n 's/^NEVOZ_CONSOLE_SECRET=//p' /etc/nevoz-provider.env | head -n1)"
if [[ -z "$current_secret" || "$current_secret" == "GERADO_AUTOMATICAMENTE_PELO_INSTALADOR" ]]; then
  console_secret="$(openssl rand -hex 32)"
  if grep -q '^NEVOZ_CONSOLE_SECRET=' /etc/nevoz-provider.env; then
    sed -i "s#^NEVOZ_CONSOLE_SECRET=.*#NEVOZ_CONSOLE_SECRET=${console_secret}#" /etc/nevoz-provider.env
  else
    echo "NEVOZ_CONSOLE_SECRET=${console_secret}" >> /etc/nevoz-provider.env
  fi
fi

install -o root -g root -m 0644 "$ROOT_DIR/deploy/nevoz-provider.service" /etc/systemd/system/nevoz-provider.service
systemctl daemon-reload
systemctl enable libvirtd
systemctl restart libvirtd
virsh -c qemu:///system net-start default >/dev/null 2>&1 || true
virsh -c qemu:///system net-autostart default >/dev/null 2>&1 || true
systemctl enable nevoz-provider
systemctl restart nevoz-provider

cat <<'MESSAGE'

NEVOZ Provider instalado.

Próximos passos obrigatórios:
1. Edite /etc/nevoz-provider.env e confira os caminhos das imagens-base Windows.
2. Coloque as imagens Windows licenciadas em /var/lib/libvirt/images/nevoz-templates/.
3. Configure o domínio + HTTPS no Nginx usando deploy/nevoz-api.nginx.example.
4. Faça o APK apontar para https://api.seudominio.com definindo NEVOZ_API_BASE_URL antes de compilar.
5. Ajuste NEVOZ_PUBLIC_BASE_URL para o mesmo domínio TLS do Nginx e reinicie: sudo systemctl restart nevoz-provider

Verificação:
  sudo systemctl status nevoz-provider
  curl http://127.0.0.1:8080/health

O serviço fica ativo após reinicializações do host. Este script não cria nem inclui licenças ou imagens Windows.
MESSAGE
