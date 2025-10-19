# Use Node.js 18 Alpine for smaller image size
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy source files maintaining directory structure
COPY server/ ./server/
COPY shared ./shared

# Install all dependencies (including dev dependencies for build)
RUN cd server && npm install

# Build the application (run from parent directory to match rootDir)
RUN cd server && npm run build

# Remove dev dependencies after build
RUN cd server && npm prune --omit=dev

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Change ownership of the app directory
RUN chown -R nodejs:nodejs /app
USER nodejs

# Expose port
EXPOSE 8080

# Health check using HTTP endpoint
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "const http = require('http'); const req = http.get('http://127.0.0.1:8080/health', (res) => { if (res.statusCode === 200) process.exit(0); else process.exit(1); }); req.on('error', () => process.exit(1)); setTimeout(() => process.exit(1), 5000);"

# Start the server
CMD ["node", "server/dist/server/server.js"]




