import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      target: 'node22',
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      target: 'node22',
    },
  },
  renderer: {
    root: 'src/renderer',
    build: {
      target: 'chrome130',
      rollupOptions: {
        input: 'src/renderer/index.html',
      },
    },
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src/renderer/src'),
      },
    },
  },
})
