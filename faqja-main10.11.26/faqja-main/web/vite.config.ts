import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Our backend serves this app under /app (API under /app/api, realtime on the same
 * origin at /socket.io), so the build base and the output folder follow that layout.
 */
export default defineConfig({
  plugins: [react()],
  base: '/app/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    // dev only: forward to the running backend
    proxy: {
      '/app/api': { target: 'http://localhost:3000', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:3000', ws: true, changeOrigin: true },
    },
  },
});
