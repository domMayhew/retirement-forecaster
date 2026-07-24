import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// A dedicated build that inlines all JS/CSS into one self-contained index.html
// (no external assets, no network calls) — used to publish the app as a live
// Artifact. `npm run build:singlefile`.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: {
    outDir: 'dist-single',
    // Keep everything in one file.
    assetsInlineLimit: 100000000,
    cssCodeSplit: false,
    reportCompressedSize: false,
  },
})
