import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  build: {
    outDir: resolve(__dirname, 'dist/main'),
    emptyOutDir: true,
    lib: {
      entry: resolve(__dirname, 'src/main/main.ts'),
      formats: ['cjs'],
      fileName: () => 'main.js'
    },
    rollupOptions: {
      external: [
        'electron',
        'better-sqlite3',
        'child_process',
        'path',
        'fs',
        'http',
        'https',
        'url',
        'os',
        'stream',
        'events',
        'util',
        'buffer',
        'crypto',
        'net',
        'tls',
        'zlib',
        'querystring',
        'node:fs',
        'node:fs/promises',
        'node:https',
        'node:path',
        'node:url',
        'node:os',
        'node:crypto',
        'node:child_process',
        // OCR 引擎：体积大且含 WASM，运行时按需加载；缺失时 OCR 自动降级为手动点选
        'paddleocr',
        'onnxruntime-web',
        'onnxruntime-node'
      ],
      output: {
        entryFileNames: 'main.js'
      }
    },
    minify: false
  }
})
