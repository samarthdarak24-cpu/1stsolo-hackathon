import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Listen on all addresses so both 127.0.0.1 and ::1 resolve. Without this
    // Vite binds IPv6 only on Windows and "localhost" fails in some browsers.
    host: true,
    proxy: {
      '/api': {
        target: process.env.API_PROXY_TARGET || 'http://localhost:5000',
        changeOrigin: true
      },
      // Uploaded item images are stored and served by the backend; without this
      // proxy the browser would get index.html (SPA fallback) and every
      // thumbnail would fall back to its placeholder icon.
      '/uploads': {
        target: process.env.API_PROXY_TARGET || 'http://localhost:5000',
        changeOrigin: true
      }
    }
  }
});
