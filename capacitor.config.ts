import type { CapacitorConfig } from "@capacitor/cli";

const serverUrl =
  process.env.CAPACITOR_SERVER_URL || "https://famora-eight.vercel.app";

const config: CapacitorConfig = {
  appId: "app.famora.family",
  appName: "Senvamily",
  webDir: "capacitor-web",
  server: {
    url: serverUrl,
    cleartext: false,
    androidScheme: "https",
  },
  android: {
    backgroundColor: "#F7F5EF",
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
};

export default config;
