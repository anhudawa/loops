import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "ie.loops.app",
  appName: "LOOPS",
  webDir: "public",
  server: {
    url: "https://gravel-ireland.vercel.app",
    cleartext: false,
  },
  ios: {
    scheme: "LOOPS",
    contentInset: "automatic",
    backgroundColor: "#0a0a0a",
    preferredContentMode: "mobile",
  },
  android: {
    backgroundColor: "#0a0a0a",
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: "#0a0a0a",
      showSpinner: false,
      launchFadeOutDuration: 300,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#0a0a0a",
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
