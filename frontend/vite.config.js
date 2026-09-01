import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// In dev this proxy stands in for Vercel's rewrite: the browser talks to one
// origin either way, so there is no CORS in the happy path — and, more to the
// point, the session cookie works. Pointing VITE_API_BASE straight at another
// origin instead breaks sign-in silently: the browser will not store a
// cross-site Set-Cookie, and SameSite=Lax would refuse to send it anyway.
//
// To develop against the deployed backend, proxy to it rather than calling it:
//   VITE_PROXY_TARGET=https://oh-assessments.onrender.com npm run dev
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.VITE_PROXY_TARGET || 'http://localhost:5060';
  return {
    plugins: [react()],
    server: {
      port: 5175,
      // changeOrigin is required for a remote target — it rewrites Host so the
      // upstream (and any TLS/SNI in front of it) sees its own hostname.
      proxy: { '/api': { target, changeOrigin: true, secure: true } },
    },
  };
});
