import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import localSavePlugin from './vite-plugin-local-save.js'
import pkg from './package.json' with { type: 'json' }
import { execSync } from 'node:child_process'

const gitHash = (() => {
  try { return execSync('git rev-parse --short HEAD').toString().trim() } catch { return 'unknown' }
})()
const buildDate = new Date().toISOString().slice(0, 10)

const base = process.env.VITE_BASE_PATH || '/line_sticker_create/'

export default defineConfig({
  plugins: [react(), localSavePlugin()],
  base,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __GIT_HASH__: JSON.stringify(gitHash),
    __BUILD_DATE__: JSON.stringify(buildDate),
  },
  server: {
    port: 3000,
    open: true
  }
})
