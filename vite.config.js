import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import localSavePlugin from './vite-plugin-local-save.js'

export default defineConfig({
  plugins: [react(), localSavePlugin()],
  base: '/line_sticker_create/',
  server: {
    port: 3000,
    open: true
  }
})
