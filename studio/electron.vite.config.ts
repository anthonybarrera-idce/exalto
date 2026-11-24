import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, loadEnv } from "electron-vite"
import type { Plugin } from "vite"

// Builds that talk to the local Firebase emulators (VITE_USE_EMULATORS=true) may also connect to them;
// a normal build only allows the Firebase services listed in index.html.
function emulatorCsp(): Plugin {
  let on = false
  return {
    name: "emulator-csp",
    configResolved(c) {
      on = loadEnv(c.mode, resolve(__dirname), "VITE_").VITE_USE_EMULATORS === "true" || process.env.VITE_USE_EMULATORS === "true"
    },
    transformIndexHtml(html) {
      return on ? html.replace("connect-src 'self'", "connect-src 'self' http://127.0.0.1:9099 http://127.0.0.1:8080 http://127.0.0.1:9199") : html
    },
  }
}

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    resolve: { alias: { "@": resolve(__dirname, "src/renderer/src") } },
    plugins: [react(), tailwindcss(), emulatorCsp()],
    // Not 5173, which the admin's Vite dev server uses; moves up if 5180 is taken.
    server: { port: 5180, strictPort: false },
  },
})
