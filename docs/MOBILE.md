# Aplicativo Android e mobile

O frontend React é compartilhado entre web e Android. Capacitor empacota `dist/` em WebView e cria o projeto Gradle durante o workflow.

## APK via GitHub

- Workflow: `.github/workflows/build-apk.yml`.
- Runtime: Node 24.
- Capacitor Android: 8.5.3.
- JDK: 21.
- Resultado: APK debug anexado como artifact.


## Estado atual

Login, dashboard, lista/criação de PC e chamadas de start/stop/restart usam a mesma API. Conectar depende de integração de gateway ainda não implementada. Touch/gamepad, clipboard nativo, transferência de arquivos, notificações push, deep links, biometria e modo landscape avançado ainda não estão implementados.

## Produção

Gerar AAB/APK release assinado com keystore armazenada em GitHub Secrets ou secret manager. Nunca incluir keystore no ZIP/repositório. Definir política de privacidade, ícones, screenshots, classificação etária, versionCode e versão da API.
