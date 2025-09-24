import { defineConfig, loadEnv } from 'vite';
import legacy from '@vitejs/plugin-legacy';

export default defineConfig(({ mode }) => {
  // Load environment variables
  const env = loadEnv(mode, process.cwd(), '');
  
  // Get signaling server URL from environment or use default
  const signalingServerUrl = env.SIGNALING_SERVER_URL || 'wss://gamework.kankawabata.com';
  
  console.log(`[Vite] Using signaling server URL: ${signalingServerUrl}`);

  return {
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
          index: 'examples/index.html',
          'tic-tac-toe': 'examples/tic-tac-toe/tic-tac-toe.html',
          'connect-four': 'examples/connect-four/connect-four.html',
          'card-game': 'examples/simple-card-game/card-game.html',
          'chess': 'examples/simple-chess/chess.html'
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
      global: 'globalThis',
      // Inject signaling server URL at build time
      __SIGNALING_SERVER_URL__: JSON.stringify(signalingServerUrl)
    }
  };
});
