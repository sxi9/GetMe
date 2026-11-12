import type { CapacitorConfig } from '@capacitor/cli';

/** Shared settings; each app target adds its id, name, web directory and native folders. */
export const base: Partial<CapacitorConfig> = {
  bundledWebRuntime: false,
  server: {
    // Point at your deployed web app during development to skip rebuilding:
    // url: 'https://getme.example.in', cleartext: false,
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: { launchShowDuration: 800, backgroundColor: '#14534A', showSpinner: false },
    StatusBar: { style: 'DARK', backgroundColor: '#14534A' },
    PushNotifications: { presentationOptions: ['badge', 'sound', 'alert'] },
  },
  android: { allowMixedContent: false },
  ios: { contentInset: 'automatic' },
};
