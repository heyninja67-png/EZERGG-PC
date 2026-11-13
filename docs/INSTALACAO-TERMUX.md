# Android/Termux e compilação do APK

Termux pode ser usado como ambiente de desenvolvimento para editar o projeto e executar os testes Node.js. Ele não transforma um celular Android em um host Windows KVM.

## Compilar o APK

Configure o endereço central do serviço na máquina que compila o app:

```bash
export NEVOZ_API_BASE_URL="https://api.seudominio.com"
gradle assembleDebug
```

O APK é salvo em `app/build/outputs/apk/debug/app-debug.apk`.

## Onde executar o provedor

Execute `deploy/install-host.sh` em um servidor Linux x86_64 dedicado com VT-x/AMD-V. Não execute o instalador no Termux do Android: o ambiente não fornece o hipervisor KVM x86_64 necessário para executar Windows 11 de verdade.

Consulte `docs/PROVEDOR-NEVOZ.md` para criar o host e publicar a API.
