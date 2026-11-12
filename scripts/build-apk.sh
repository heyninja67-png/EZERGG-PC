#!/usr/bin/env bash
set -euo pipefail


cd "$(dirname "$0")/../apps/web"
npm install --no-audit --no-fund
npm run build
if [[ ! -d android ]]; then
  npx cap add android
fi
npx cap sync android
cd android
chmod +x ./gradlew
./gradlew --no-daemon assembleDebug
printf '\nAPK gerado em: %s\n' "$(pwd)/app/build/outputs/apk/debug/app-debug.apk"
