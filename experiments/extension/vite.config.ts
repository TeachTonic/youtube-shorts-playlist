import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
const root = resolve(import.meta.dirname);
export default defineConfig({
  root,
  plugins: [{
    name: 'extension-manifest',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'manifest.json', source: readFileSync(resolve(root, 'manifest.json'), 'utf8') });
    },
  }],
  build: {
    outDir: 'dist', emptyOutDir: true, target: 'es2022',
    rollupOptions: {
      input: { worker: resolve(root, 'src/worker.ts'), popup: resolve(root, 'popup.html'), diagnostic: resolve(root, 'diagnostic.html') },
      output: { entryFileNames: '[name].js', chunkFileNames: 'assets/[name]-[hash].js' },
    },
  },
});
