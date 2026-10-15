import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // Long-lived vendor chunks keep the browser cache warm across app deploys.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/[\\/](pixi\.js|@pixi|earcut|eventemitter3|parse-svg-path|ismobilejs)[\\/]/.test(id)) return 'pixi';
          if (/[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'react';
          if (/[\\/](msw|@mswjs|@bundled-es-modules|graphql|headers-polyfill|outvariant|strict-event-emitter|is-node-process|until-async|@open-draft|cookie|statuses|tough-cookie|tldts|tldts-core|path-to-regexp|rettime|type-fest|picocolors)[\\/]/.test(id)) return 'mocks';
          return 'vendor';
        },
      },
    },
  },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
