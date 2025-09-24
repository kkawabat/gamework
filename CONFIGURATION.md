# GameWork Configuration

## Simplified Environment Variable Configuration

The signaling server URL is configured using a simple .env file approach with Vite's built-in environment variable support.

### How It Works

1. **GitHub Actions** creates a `.env` file from secrets
2. **Vite** loads the environment variables using `loadEnv()`
3. **Vite** injects the URL at build time using `define`
4. **Examples** use the injected variable

### Configuration Flow

```
GitHub Secret → .env file → Vite loadEnv() → define config → Injected into code
```

## Setup

### GitHub Actions (Automatic)
The deployment workflow automatically creates a `.env` file:

```yaml
- name: Create .env file
  run: |
    echo "SIGNALING_SERVER_URL=${{ secrets.SIGNALING_SERVER_URL }}" > .env
```

### Local Development
Create a `.env` file in the project root:

```bash
# .env
SIGNALING_SERVER_URL=ws://localhost:8080
```

### Production Deployment
Set the `SIGNALING_SERVER_URL` secret in your GitHub repository settings.

## Vite Configuration

The `vite.config.ts` handles everything automatically:

```typescript
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const signalingServerUrl = env.SIGNALING_SERVER_URL || 'wss://gamework.kankawabata.com';
  
  return {
    define: {
      __SIGNALING_SERVER_URL__: JSON.stringify(signalingServerUrl)
    }
  };
});
```

## Examples Usage

The examples use the injected variable:

```typescript
// examples/signaling-config.ts
const getSignalingServerUrl = (): string => {
  // @ts-ignore - This is defined by Vite's define config
  if (typeof __SIGNALING_SERVER_URL__ !== 'undefined') {
    return __SIGNALING_SERVER_URL__;
  }
  return 'wss://gamework.kankawabata.com'; // Fallback
};
```

## Security Notes

- **Never commit production URLs** to version control
- **Use GitHub Secrets** for deployment configuration
- **Default to development URLs** in code
- **Environment variables** are loaded securely by Vite

## Examples

### Local Development
```bash
# Create .env file
echo "SIGNALING_SERVER_URL=ws://localhost:8080" > .env
npm run dev
```

### Production Build
```bash
# Set environment variable
SIGNALING_SERVER_URL=wss://prod.example.com npm run build
```

### GitHub Actions (Automatic)
```yaml
# No additional configuration needed
# The workflow automatically creates .env from secrets
```
