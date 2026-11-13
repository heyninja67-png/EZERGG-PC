# Testes

## API local

Requer Node.js 22 ou superior.

```bash
cd server
npm test
```

## Android

O GitHub Actions instala Java 17, Android SDK API 35 e Gradle 8.9, compila `assembleDebug` e publica `nevoz-setup-apk` como artifact.

O primeiro build deve ser verificado no Actions. No ambiente de montagem deste ZIP não há Android SDK/Gradle local; o APK precisa ser compilado no GitHub Actions ou em uma máquina com Android SDK/Gradle.
