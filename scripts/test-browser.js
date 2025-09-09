#!/usr/bin/env node

const puppeteer = require('puppeteer');
const http = require('http');
const path = require('path');
const { execSync } = require('child_process');

const PORT = process.env.TEST_PORT || 3001;
const BUILD_DIR = path.join(__dirname, '..', 'tic-tac-toe-build');

// Simple HTTP server for testing
function createTestServer() {
    return new Promise((resolve) => {
        const server = http.createServer((req, res) => {
            let filePath = path.join(BUILD_DIR, req.url === '/' ? '/index.html' : req.url);
            
            require('fs').readFile(filePath, (error, content) => {
                if (error) {
                    res.writeHead(404);
                    res.end('File not found');
                } else {
                    const ext = path.extname(filePath);
                    const mimeTypes = {
                        '.html': 'text/html',
                        '.js': 'text/javascript',
                        '.css': 'text/css'
                    };
                    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
                    res.end(content);
                }
            });
        });
        
        server.listen(PORT, () => {
            console.log(`🧪 Test server running on http://localhost:${PORT}`);
            resolve(server);
        });
    });
}

// Browser tests
async function runBrowserTests() {
    console.log('🌐 Starting browser tests...');
    
    const server = await createTestServer();
    const browser = await puppeteer.launch({ 
        headless: false, // Set to true for CI
        devtools: false 
    });
    
    try {
        const page = await browser.newPage();
        
        // Test 1: Page loads without errors
        console.log('📄 Testing page load...');
        const response = await page.goto(`http://localhost:${PORT}`, { 
            waitUntil: 'networkidle0',
            timeout: 10000 
        });
        
        if (response.status() !== 200) {
            throw new Error(`Page failed to load: ${response.status()}`);
        }
        
        // Test 2: Check for console errors
        const consoleErrors = [];
        page.on('console', msg => {
            if (msg.type() === 'error') {
                consoleErrors.push(msg.text());
            }
        });
        
        // Test 3: Check if GameWork framework loads
        console.log('🔧 Testing GameWork framework loading...');
        await page.waitForFunction(() => {
            return window.GameHost && window.GameClient;
        }, { timeout: 5000 }).catch(() => {
            throw new Error('GameWork framework failed to load');
        });
        
        // Test 4: Check if Tic-Tac-Toe game initializes
        console.log('🎮 Testing Tic-Tac-Toe game initialization...');
        await page.waitForFunction(() => {
            return document.querySelector('.game-container') !== null;
        }, { timeout: 5000 });
        
        // Test 5: Check for import errors
        if (consoleErrors.length > 0) {
            console.error('❌ Console errors found:');
            consoleErrors.forEach(error => console.error(`   ${error}`));
            throw new Error('Console errors detected');
        }
        
        console.log('✅ All browser tests passed!');
        
    } catch (error) {
        console.error('❌ Browser test failed:', error.message);
        process.exit(1);
    } finally {
        await browser.close();
        server.close();
    }
}

// Module import tests
async function testModuleImports() {
    console.log('📦 Testing module imports...');
    
    const server = await createTestServer();
    const browser = await puppeteer.launch({ headless: true });
    
    try {
        const page = await browser.newPage();
        
        // Test each module import
        const modules = [
            'dist/index.js',
            'dist/utils/uuid.js',
            'dist/core/GameEngine.js',
            'dist/host/GameHost.js',
            'dist/client/GameClient.js',
            'examples/simple-tic-tac-toe.js'
        ];
        
        for (const module of modules) {
            console.log(`   Testing ${module}...`);
            try {
                await page.goto(`http://localhost:${PORT}`);
                await page.evaluate(async (modulePath) => {
                    await import(`./${modulePath}`);
                }, module);
                console.log(`   ✅ ${module} imported successfully`);
            } catch (error) {
                console.error(`   ❌ ${module} failed to import:`, error.message);
                throw error;
            }
        }
        
        console.log('✅ All module imports successful!');
        
    } catch (error) {
        console.error('❌ Module import test failed:', error.message);
        process.exit(1);
    } finally {
        await browser.close();
        server.close();
    }
}

// Main test runner
async function runTests() {
    console.log('🧪 GameWork Test Suite');
    console.log('====================');
    
    try {
        // Run unit tests first
        console.log('🔬 Running unit tests...');
        execSync('npm test', { stdio: 'inherit' });
        
        // Run module import tests
        await testModuleImports();
        
        // Run browser tests
        await runBrowserTests();
        
        console.log('');
        console.log('🎉 All tests passed!');
        
    } catch (error) {
        console.error('❌ Test suite failed:', error.message);
        process.exit(1);
    }
}

// Check if puppeteer is available
try {
    require.resolve('puppeteer');
    runTests();
} catch (error) {
    console.log('📦 Installing puppeteer for browser testing...');
    execSync('npm install --save-dev puppeteer', { stdio: 'inherit' });
    runTests();
}
