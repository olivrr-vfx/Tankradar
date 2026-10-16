import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.tankradar',
  appName: 'Tankradar',
  webDir: 'dist',
  backgroundColor: '#0d1726',
  plugins: {
    // Native HTTP for fetch(): no CORS restrictions for the fuel price APIs.
    CapacitorHttp: { enabled: true },
    LocalNotifications: { iconColor: '#2f5bff' },
  },
  android: { allowMixedContent: false },
  ios: { contentInset: 'never' },
};

export default config;
