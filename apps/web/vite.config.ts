import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API = `http://localhost:${process.env.API_PORT ?? 4000}`;
/** VITE_APP_TARGET=customer|partner|shop builds one app (own name, icon, manifest, start path); unset builds the all-in-one web app. */
const TARGET = process.env.VITE_APP_TARGET as 'customer' | 'partner' | 'shop' | undefined;
const META: Record<string, { title: string; manifest: string }> = {
  customer: { title: 'GetMe', manifest: '/manifest-customer.webmanifest' },
  partner: { title: 'GetMe Partner', manifest: '/manifest-partner.webmanifest' },
  shop: { title: 'GetMe Shops', manifest: '/manifest-shop.webmanifest' },
};
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'getme-target',
      transformIndexHtml(html) {
        if (!TARGET) return html;
        const m = META[TARGET];
        return html.replace('<title>GetMe</title>', `<title>${m.title}</title>`).replace('href="/manifest.webmanifest"', `href="${m.manifest}"`).replace('<link rel="icon" href="/icon.svg"', `<link rel="icon" href="/icon-${TARGET}.svg"`);
      },
    },
  ],
  build: { outDir: TARGET ? `dist/${TARGET}` : 'dist', emptyOutDir: true },
  server: {
    proxy: {
      '/api': { target: API, changeOrigin: true },
      '/uploads': { target: API, changeOrigin: true },
      '/ws': { target: API.replace('http', 'ws'), ws: true },
    },
  },
});
