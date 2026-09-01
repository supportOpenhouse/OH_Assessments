import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In dev this proxy stands in for Vercel's rewrite: the browser talks to one
// origin either way, so there is no CORS in the happy path.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5175,
    proxy: { '/api': { target: 'http://localhost:5060', changeOrigin: true } },
  },
});
