import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  // Relative base so the build works when served from a GitHub Pages
  // project subpath (e.g. /Master/) as well as locally.
  base: './',
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
  },
})
