import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.ezergg.pc',
  appName: 'EZERGG PC',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
  },
}

export default config
