import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  build: { outDir: '../dist/frontend', emptyOutDir: true },
  // In development the API runs separately on port 3000.
  server: { port: 5173, proxy: { '/api': 'http://localhost:3000' } },
});
