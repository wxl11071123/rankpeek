import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  build: {
    outDir: resolve(__dirname, 'dist/preload'),
    emptyOutDir: true,
    lib: {
      entry: resolve(__dirname, 'src/preload/preload.ts'),
      formats: ['cjs'],
      fileName: () => 'preload.js'
    },
    rollupOptions: {
      external: ['electron'],
      output: {
        entryFileNames: 'preload.js'
      }
    },
    minify: false
  }
})
