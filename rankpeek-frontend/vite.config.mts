import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { rmSync } from 'fs'
import { resolve } from 'path'

export default defineConfig({
  plugins: [
    vue(),
    {
      name: 'exclude-game-assets-from-renderer-bundle',
      closeBundle() {
        rmSync(resolve(__dirname, 'dist/renderer/game-assets'), { recursive: true, force: true })
      }
    }
  ],
  base: './',
  root: 'src/renderer',
  publicDir: resolve(__dirname, 'public'),
  define: {
    global: 'globalThis'
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/renderer')
    }
  },
  build: {
    outDir: resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'vue-vendor': ['vue', 'vue-router', 'pinia'],
          'stomp': ['@stomp/stompjs', 'sockjs-client']
        }
      }
    }
  },
  server: {
    port: 5173,
    strictPort: true
  }
})
