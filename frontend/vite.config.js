import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

import basicSsl from '@vitejs/plugin-basic-ssl';

const isHttps = process.env.HTTPS === 'true' || process.argv.includes('--https');

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    ...(isHttps ? [basicSsl()] : []),
  ],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/uploads': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
