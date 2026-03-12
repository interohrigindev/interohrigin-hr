import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { readFileSync, writeFileSync } from 'fs'

// Cloudflare Pages SPA: 404.html = index.html 복사
function cloudflarePagesSpa(): Plugin {
  return {
    name: 'cloudflare-pages-spa',
    closeBundle() {
      const dist = path.resolve(__dirname, 'dist')
      const html = readFileSync(path.join(dist, 'index.html'), 'utf-8')
      writeFileSync(path.join(dist, '404.html'), html)
    },
  }
}

export default defineConfig({
  plugins: [react(), cloudflarePagesSpa()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
