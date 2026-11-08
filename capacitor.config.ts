import type { CapacitorConfig } from "@capacitor/cli";

// Android app shell: the APK ships the static site from out/ (built by `npm run build:app`).
const config: CapacitorConfig = {
  appId: "com.mimo.music",
  appName: "Mimo",
  webDir: "out",
  android: {
    // the launch animation is drawn by the web app itself (components/Splash.tsx), on the theme colour
    backgroundColor: "#121110",
  },
  server: {
    // https://localhost: YouTube's player refuses embeds from odd origins (errors 152/153);
    // a normal https origin with a referrer keeps it happy
    androidScheme: "https",
  },
};

export default config;
