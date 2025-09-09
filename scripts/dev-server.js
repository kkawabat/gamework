#!/usr/bin/env node

const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PORT = process.env.PORT || 3000;
const BUILD_DIR = path.join(__dirname, '..', 'tic-tac-toe-build');

// MIME types for different file extensions
const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.ts': 'text/typescript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.wav': 'audio/wav',
    '.mp4': 'video/mp4',
    '.woff': 'application/font-woff',
    '.ttf': 'application/font-ttf',
    '.eot': 'application/vnd.ms-fontobject',
    '.otf': 'application/font-otf',
    '.wasm': 'application/wasm'
};

// Auto-rebuild function
function rebuildIfNeeded() {
    try {
        console.log('🔨 Auto-rebuilding...');
        execSync('npm run build', { stdio: 'inherit' });
        console.log('✅ Build completed');
    } catch (error) {
        console.error('❌ Build failed:', error.message);
    }
}

// Watch for file changes (WSL2 compatible)
function watchFiles() {
    const srcDir = path.join(__dirname, '..', 'src');
    const examplesDir = path.join(__dirname, '..', 'examples');
    
    console.log('👀 Watching for changes in src/ and examples/...');
    
    // Function to recursively watch directories (WSL2 compatible)
    function watchDirectory(dir, callback) {
        if (!fs.existsSync(dir)) return;
        
        // Watch the directory itself
        fs.watch(dir, (eventType, filename) => {
            if (filename && (filename.endsWith('.ts') || filename.endsWith('.html'))) {
                console.log(`📝 ${filename} changed, rebuilding...`);
                callback();
            }
        });
        
        // Recursively watch subdirectories
        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    watchDirectory(path.join(dir, entry.name), callback);
                }
            }
        } catch (error) {
            console.log(`⚠️  Could not watch ${dir}: ${error.message}`);
        }
    }
    
    // Watch src directory
    watchDirectory(srcDir, rebuildIfNeeded);
    
    // Watch examples directory
    watchDirectory(examplesDir, rebuildIfNeeded);
}

// Create HTTP server
const server = http.createServer((req, res) => {
    let filePath = path.join(BUILD_DIR, req.url === '/' ? '/index.html' : req.url);
    
    // Security: prevent directory traversal
    if (!filePath.startsWith(BUILD_DIR)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }
    
    // Check if file exists
    fs.access(filePath, fs.constants.F_OK, (err) => {
        if (err) {
            // File not found, try to serve index.html for SPA routing
            const indexPath = path.join(BUILD_DIR, 'index.html');
            fs.access(indexPath, fs.constants.F_OK, (indexErr) => {
                if (indexErr) {
                    res.writeHead(404);
                    res.end('File not found');
                } else {
                    serveFile(indexPath, res);
                }
            });
        } else {
            serveFile(filePath, res);
        }
    });
});

function serveFile(filePath, res) {
    const extname = String(path.extname(filePath)).toLowerCase();
    const contentType = mimeTypes[extname] || 'application/octet-stream';
    
    fs.readFile(filePath, (error, content) => {
        if (error) {
            res.writeHead(500);
            res.end('Server error: ' + error.code);
        } else {
            res.writeHead(200, { 
                'Content-Type': contentType,
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            });
            res.end(content, 'utf-8');
        }
    });
}

// Start server
server.listen(PORT, () => {
    console.log('🚀 GameWork Development Server');
    console.log(`📡 Server running at http://localhost:${PORT}/`);
    console.log(`📁 Serving from: ${BUILD_DIR}`);
    console.log('');
    console.log('🎮 Available endpoints:');
    console.log(`   Main game: http://localhost:${PORT}/`);
    console.log(`   Tic-Tac-Toe: http://localhost:${PORT}/tic-tac-toe/`);
    console.log(`   Framework demo: http://localhost:${PORT}/demo/`);
    console.log('');
    console.log('⚡ Features:');
    console.log('   - Auto-rebuild on file changes');
    console.log('   - No-cache headers for development');
    console.log('   - SPA routing support');
    console.log('');
    console.log('Press Ctrl+C to stop the server');
    console.log('');
    
    // Initial build
    rebuildIfNeeded();
    
    // Start watching for changes
    watchFiles();
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n👋 Shutting down development server...');
    server.close(() => {
        console.log('✅ Server stopped');
        process.exit(0);
    });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});
