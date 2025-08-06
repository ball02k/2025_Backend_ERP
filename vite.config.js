import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite configuration for the Construction ERP frontend.  When running
// the development server (`npm run dev`), this proxy forwards any
// requests beginning with `/api` to the backend Express app on
// port 3001【271806284141197†L4-L9】.  Without this, axios calls like
// `axios.get('/api/projects/1')` would hit the Vite server and fail
// with 404.  See the backend's CORS configuration to ensure the
// allowed origin matches this host/port.
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  }
});