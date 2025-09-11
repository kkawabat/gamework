import { defineConfig } from 'vite';
import legacy from '@vitejs/plugin-legacy';

export default defineConfig({
  base: './',
  plugins: [
    legacy({
      targets: ['defaults', 'not IE 11']
    })
  ],
  build: {
    outDir: 'demo-build',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: 'src/demos/index.html',
        'tic-tac-toe': 'src/demos/tic-tac-toe.html'
      },
      output: {
        // Keep modules separate for better caching
        manualChunks: {
          'gamework-core': ['src/core/GameEngine.ts'],
          'gamework-networking': ['src/networking/WebRTCManager.ts', 'src/networking/SignalingService.ts'],
          'gamework-host': ['src/host/GameHost.ts'],
          'gamework-client': ['src/client/GameClient.ts']
        }
      }
    },
    // Ensure compatibility with older browsers
    target: 'es2020'
  },
  // Development server configuration
  server: {
    port: 3000,
    open: true
  },
  // Optimize dependencies
  optimizeDeps: {
    include: ['uuid', 'qrcode']
  },
  // Handle external dependencies properly
  define: {
    // Ensure proper global access
    global: 'globalThis'
  }
});
