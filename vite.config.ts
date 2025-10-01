import { defineConfig, loadEnv } from 'vite';
import legacy from '@vitejs/plugin-legacy';

export default defineConfig(({ mode }) => {
  // Load environment variables
  const env = loadEnv(mode, process.cwd(), '');
  
  // Get signaling server URL from environment
  const signalingServerUrl = env.SIGNALING_SERVER_URL;
  
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
          'tic-tac-toe': 'examples/tic-tac-toe/tic-tac-toe.html'
        },
        output: {
          // Keep modules separate for better caching
          manualChunks: {
            'gamework-core': ['client/core/GameEngine.ts'],
            'gamework-networking': ['client/networking/WebRTCManager.ts', 'client/networking/SignalingService.ts'],
            'gamework-main': ['client/GameWork.ts']
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
