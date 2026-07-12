import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // Load environment variables
  const env = loadEnv(mode, process.cwd(), '');
  
  // Get signaling server URL from environment
  const signalingServerUrl = env.SIGNALING_SERVER_URL;
  
  console.log(`[Vite] Using signaling server URL: ${signalingServerUrl}`);

  return {
    base: './',
    // No @vitejs/plugin-legacy: chess.js uses BigInt literals, which cannot be
    // transpiled for pre-es2020 browsers (the legacy plugin's modern target
    // caps at chrome64/safari12 and rejects them at build time).
    build: {
      outDir: 'demo-build',
      emptyOutDir: true,
      rollupOptions: {
        input: {
          index: 'examples/index.html',
          'tic-tac-toe': 'examples/tic-tac-toe/tic-tac-toe.html',
          'connect-four': 'examples/connect-four/connect-four.html',
          chess: 'examples/chess/chess.html'
        },
        output: {
          // Keep modules separate for better caching
          manualChunks: {
            'gamework-core': ['src/core/StateStore.ts', 'src/core/EventBus.ts'],
            'gamework-engines': ['src/engines/GameEngine.ts', 'src/engines/UIEngine.ts'],
            'gamework-network': ['src/engines/NetworkEngine.ts'],
            'gamework-main': ['src/core/GameWork.ts']
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
      include: ['uuid', 'qrcode', 'chess.js']
    },
    // Handle external dependencies properly
    define: {
      // Ensure proper global access
      global: 'globalThis',
      // Inject signaling server URL at build time; empty string when unset so
      // the client falls back to ws://localhost:8080 for local dev
      __SIGNALING_SERVER_URL__: JSON.stringify(signalingServerUrl ?? '')
    }
  };
});
