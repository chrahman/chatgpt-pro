import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: "src",
  manifest: {
    description: "Vu Quiz Helper",
    name: "Vu Quiz Helper",
    version: "1.0.0",
    // icons: {
    //   "16": "icon16.png",
    //   "48": "icon48.png",
    //   "128": "icon128.png",
    // },
    host_permissions: ["https://*.chatgpt.com/*"],
    declarative_net_request: {
      rule_resources: [
        {
          id: "ua_rules",
          enabled: true,
          path: "ua_rules.json",
        },
      ],
    },
    optional_host_permissions: ["https://*/*", "wss://*/*"],
    permissions: ["storage", "unlimitedStorage", "sidePanel", "declarativeNetRequestWithHostAccess", "scripting", "cookies"],
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
