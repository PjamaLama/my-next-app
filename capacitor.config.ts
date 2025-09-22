import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.sheetyai.app',
  appName: 'Sheety AI',
  server: {
    url: 'https://www.sheetyai.com',
    cleartext: false
  }
};

export default config;
