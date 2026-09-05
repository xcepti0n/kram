import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 4311,
    // Proxy /api to the server so the browser sees one origin in development,
    // exactly as it does in production (DD-3).
    proxy: { '/api': { target: 'http://localhost:4310', changeOrigin: true } },
  },
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: true },
});
