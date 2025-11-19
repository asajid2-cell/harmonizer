import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/codesniff-app/',
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api/codesniff': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/codesniff/, '/api'),
      }
    }
  },
  build: {
    outDir: path.resolve(__dirname, '../../frontend/codesniff-app'),
    emptyOutDir: true,
    sourcemap: true,
  }
})
