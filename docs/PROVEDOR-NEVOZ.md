# Provedor próprio NEVOZ — KVM/libvirt

A versão 0.7 troca o adaptador Proxmox/API externa por um provedor local. A API NEVOZ executa `virsh` e `qemu-img` no próprio host Linux; não chama uma API de Cloud PC de terceiros.

## O que é necessário

- Servidor físico ou dedicado **Linux x86_64**, com virtualização Intel VT-x/AMD-V habilitada no firmware.
- KVM, libvirt, QEMU, `qemu-img`, OVMF/UEFI e `swtpm`.
- RAM, núcleos e SSD reais em quantidade suficiente. Os números do app são limites do catálogo, não recursos ilimitados.
- Uma imagem-base QCOW2 para cada edição Windows disponibilizada, criada a partir de mídia/licença válida. Prepare-a com drivers VirtIO e deixe-a inicializável em UEFI + TPM 2.0.
- Um domínio com DNS e HTTPS válido para que o app Android consiga alcançar o serviço pela internet.

**O Android/Termux não é o host Windows deste projeto.** O APK controla máquinas; ele não contém CPU x86, RAM nem discos de servidor e não pode fabricar um computador na nuvem. O host KVM é a máquina física que executa os Windows.

## Instalação

No Ubuntu Server/Debian x86_64, copie/descompacte o projeto e execute:

```bash
sudo bash deploy/install-host.sh
```

O instalador prepara KVM/libvirt, cria o usuário de serviço `nevoz`, instala a unidade `systemd` e habilita o serviço para iniciar automaticamente após reinicializações. O serviço escuta em `127.0.0.1:8080` internamente e não publica essa porta na internet.

## Imagens Windows

Coloque os discos-base em:

```text
/var/lib/libvirt/images/nevoz-templates/windows-11.qcow2
/var/lib/libvirt/images/nevoz-templates/windows-11-pro.qcow2
/var/lib/libvirt/images/nevoz-templates/windows-11-enterprise.qcow2
```

Os arquivos devem corresponder a instalações licenciadas. Não distribuímos ISO, chave de ativação ou imagem Windows. O provedor cria um disco QCOW2 de sobreposição por Cloud PC, ligado ao disco-base. Os dados gravados pelo usuário ficam no disco de sobreposição persistente; parar ou fechar o app não remove esse disco.

Edite `/etc/nevoz-provider.env` para apontar para as imagens e ajustar os limites de CPU/RAM/SSD. Reinicie o serviço depois:

```bash
sudo systemctl restart nevoz-provider
sudo systemctl status nevoz-provider
curl http://127.0.0.1:8080/health
```

## GPU

GPU dedicada não é criada por configuração de software. Para oferecer uma opção, o host precisa suportar IOMMU e VFIO; a GPU deve estar isolada em um grupo IOMMU e sem uso pelo host. Depois de preparar o passthrough, configure `NEVOZ_GPU_PROFILES_JSON` com o endereço PCI real, por exemplo:

```env
NEVOZ_GPU_PROFILES_JSON='{"none":{"label":"Sem GPU dedicada"},"gpu-1":{"label":"GPU dedicada do servidor","pciAddress":"0000:01:00.0"}}'
```

Esse endereço é apenas um exemplo. Não copie sem verificar `lspci -nn` e os grupos IOMMU do seu servidor. A mesma GPU não pode ser atribuída simultaneamente a várias VMs quando usada por passthrough exclusivo.

## Publicação HTTPS

O serviço escuta por padrão apenas em `127.0.0.1:8080`. Publique-o por um proxy reverso Nginx com certificado TLS válido; o exemplo está em `deploy/nevoz-api.nginx.example`. Não exponha a porta 8080 diretamente na internet, nem abra a porta de gerenciamento do libvirt.

## Publicação do serviço e ativação do app

Você precisa ter um host com um domínio apontado para ele. Crie o DNS `A`/`AAAA` para `api.seudominio.com`, obtenha um certificado TLS válido e copie `deploy/nevoz-api.nginx.example` para a configuração do Nginx. Troque o domínio e os caminhos do certificado no arquivo e ative o site, por exemplo:

```bash
sudo cp deploy/nevoz-api.nginx.example /etc/nginx/sites-available/nevoz-api
# Edite server_name e os caminhos ssl_certificate/ssl_certificate_key.
sudo ln -s /etc/nginx/sites-available/nevoz-api /etc/nginx/sites-enabled/nevoz-api
sudo nginx -t && sudo systemctl reload nginx
```

Edite `/etc/nevoz-provider.env` e use exatamente a URL HTTPS pública do serviço:

```env
NEVOZ_PUBLIC_BASE_URL=https://api.seudominio.com
```

Depois reinicie o provedor:

```bash
sudo systemctl restart nevoz-provider
curl https://api.seudominio.com/health
```

O aplicativo gera um identificador e um segredo aleatório na primeira execução, registra a instalação no NEVOZ e guarda as credenciais de dispositivo no armazenamento privado do Android. O usuário não digita IP, porta, chave de API ou código de pareamento. Para publicar o APK, compile com o endereço do seu serviço:

```bash
NEVOZ_API_BASE_URL=https://api.seudominio.com gradle assembleDebug
```

Ou defina a propriedade `NEVOZ_API_BASE_URL` no `~/.gradle/gradle.properties` do computador de build. O endereço é configuração de implantação, não um campo exibido ao usuário. O valor de exemplo do projeto termina em `.invalid` e não é um servidor real.

A ativação anônima pode ser desativada após o cadastro dos dispositivos conhecidos usando `NEVOZ_ALLOW_GUEST_ENROLLMENT=false`. O limite padrão é um Cloud PC por instalação; ajuste quotas conscientemente antes de permitir muitos usuários. Como esta versão ainda não tem contas de usuário, senha, recuperação de conta ou cobrança, não trate o cadastro de dispositivo como autenticação suficiente para um serviço público multiusuário.

## Conexão à tela do Windows

A tela remota está integrada ao provedor NEVOZ. O QEMU cria o VNC de cada VM ouvindo somente em `127.0.0.1`. Quando o usuário toca em **Conectar ao Windows**, o app solicita ao backend um ticket HMAC com validade de três minutos. O backend valida o dono da máquina e abre a ponte WebSocket para o VNC local. O cliente noVNC é servido pela própria API e renderizado em um WebView seguro dentro do app.

Não exponha portas VNC individuais nem abra a porta do libvirt na internet. O Nginx precisa encaminhar `Upgrade`/`Connection` e manter o timeout de WebSocket, como no arquivo `deploy/nevoz-api.nginx.example`. O instalador adiciona a dependência `@novnc/novnc` ao próprio provedor. O noVNC é um cliente VNC HTML5, não um provedor de Cloud PC; ele funciona em navegadores móveis modernos e exige WebSocket. Consulte a documentação e licença do projeto: [noVNC](https://novnc.com/) e [pacote npm](https://www.npmjs.com/package/@novnc/novnc).

A interface Android não pede endereço/porta VNC/RDP nem senha de pareamento. O usuário ainda pode precisar autenticar dentro do próprio Windows conforme a conta configurada na imagem-base.

## Segurança e limites

- O segredo do dispositivo é criado automaticamente e não é mostrado na interface.
- Credenciais de administração não ficam no APK.
- A API fica atrás de HTTPS e escuta apenas localhost.
- O cadastro inicial do dispositivo é automático e baseado em identidade privada do app. Como não há conta/senha de usuário nesta versão, qualquer pessoa com o APK consegue cadastrar uma instalação enquanto `NEVOZ_ALLOW_GUEST_ENROLLMENT=true`; mantenha quota e rate limiting e desative esse modo quando terminar de autorizar os dispositivos pretendidos. Para um serviço público multiusuário, implemente antes uma camada real de contas/convites e cobrança.
- Windows 11 precisa de imagem inicial corretamente preparada e licença apropriada. Uma VM criada não significa ativação/licenciamento automático.
