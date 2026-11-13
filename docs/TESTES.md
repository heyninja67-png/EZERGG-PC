# Testes

## API local

Requer Node.js 22 ou superior.

```bash
cd server
npm test
```

## Android

O GitHub Actions instala Java 17, Android SDK API 35 e Gradle 8.9, compila `assembleDebug` e publica `nevoz-setup-apk` como artifact.

O primeiro build deve ser verificado no Actions. O ambiente deste pacote não contém um Android SDK/Gradle local para gerar o APK dentro do arquivo ZIP.
