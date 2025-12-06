import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import packageJson from './package.json';

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  build: {
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'popup.html')
      }
    },
    outDir: 'dist'
  }
});



