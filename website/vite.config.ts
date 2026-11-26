import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Firebase Hosting only deploys folders inside the Firebase project (admin/),
// so the build goes to admin/web-dist, the `web` hosting target's public dir.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: { outDir: '../admin/web-dist', emptyOutDir: true },
})
