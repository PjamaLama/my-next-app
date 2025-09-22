import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.sheetyai.app',
  appName: 'Sheety AI',
  webDir: 'www',
  server: {
    url: 'https://www.sheetyai.com',
    cleartext: false
  },
  plugins: {
    GoogleAuth: {
      scopes: ['profile', 'email'],
      serverClientId: 'YOUR_GOOGLE_CLIENT_ID_HERE',
      forceCodeForRefreshToken: true,
    },
  },
};

export default config;
