#!/usr/bin/env node

// Simple test script for the GameWork signaling server
const WebSocket = require('ws');

const SERVER_URL = process.env.SERVER_URL || 'ws://localhost:8080';
const ROOM_ID = 'TEST-' + Math.random().toString(36).substr(2, 5).toUpperCase();

console.log(`🧪 Testing GameWork Signaling Server`);
console.log(`📡 Server: ${SERVER_URL}`);
console.log(`🏠 Room: ${ROOM_ID}`);
console.log('');

let testResults = {
    connection: false,
    joinRoom: false,
    signaling: false,
    roomUpdate: false,
    disconnect: false
};

function runTest() {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(SERVER_URL);
        let testTimeout;
        
        // Set overall test timeout
        const overallTimeout = setTimeout(() => {
            console.log('❌ Test timed out');
            ws.close();
            reject(new Error('Test timeout'));
        }, 10000);
        
        ws.onopen = () => {
            console.log('✅ Connected to signaling server');
            testResults.connection = true;
            
            // Test 1: Join room
            console.log('📝 Testing room join...');
            ws.send(JSON.stringify({
                type: 'join_room',
                payload: {
                    roomId: ROOM_ID,
                    playerId: 'test-player-1',
                    playerName: 'Test Player 1'
                }
            }));
        };
        
        ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                console.log(`📨 Received: ${message.type}`);
                
                switch (message.type) {
                    case 'room_joined':
                        console.log('✅ Successfully joined room');
                        testResults.joinRoom = true;
                        
                        // Test 2: Send signaling message
                        console.log('📝 Testing signaling message...');
                        ws.send(JSON.stringify({
                            type: 'signaling_message',
                            payload: {
                                type: 'offer',
                                payload: { sdp: 'test-offer' },
                                to: 'test-player-2'
                            }
                        }));
                        break;
                        
                    case 'signaling_message':
                        console.log('✅ Signaling message received');
                        testResults.signaling = true;
                        
                        // Test 3: Send ping
                        console.log('📝 Testing ping...');
                        ws.send(JSON.stringify({
                            type: 'ping',
                            payload: {}
                        }));
                        break;
                        
                    case 'room_update':
                        console.log('✅ Room update received');
                        testResults.roomUpdate = true;
                        break;
                        
                    case 'pong':
                        console.log('✅ Pong received');
                        
                        // Test 4: Leave room
                        console.log('📝 Testing room leave...');
                        ws.send(JSON.stringify({
                            type: 'leave_room',
                            payload: {}
                        }));
                        break;
                        
                    case 'room_left':
                        console.log('✅ Successfully left room');
                        testResults.disconnect = true;
                        
                        // All tests completed
                        clearTimeout(overallTimeout);
                        ws.close();
                        resolve();
                        break;
                        
                    case 'error':
                        console.log(`❌ Server error: ${message.payload.message}`);
                        clearTimeout(overallTimeout);
                        ws.close();
                        reject(new Error(message.payload.message));
                        break;
                        
                    default:
                        console.log(`ℹ️  Unknown message type: ${message.type}`);
                }
            } catch (error) {
                console.error('❌ Error parsing message:', error);
                clearTimeout(overallTimeout);
                ws.close();
                reject(error);
            }
        };
        
        ws.onerror = (error) => {
            console.error('❌ WebSocket error:', error);
            clearTimeout(overallTimeout);
            reject(error);
        };
        
        ws.onclose = (code, reason) => {
            console.log(`🔌 Connection closed: ${code} ${reason}`);
            clearTimeout(overallTimeout);
            
            if (!testResults.disconnect) {
                reject(new Error('Connection closed unexpectedly'));
            }
        };
    });
}

async function main() {
    try {
        console.log('🚀 Starting signaling server test...\n');
        await runTest();
        
        console.log('\n📊 Test Results:');
        console.log('================');
        console.log(`Connection:     ${testResults.connection ? '✅' : '❌'}`);
        console.log(`Join Room:      ${testResults.joinRoom ? '✅' : '❌'}`);
        console.log(`Signaling:      ${testResults.signaling ? '✅' : '❌'}`);
        console.log(`Room Update:    ${testResults.roomUpdate ? '✅' : '❌'}`);
        console.log(`Disconnect:     ${testResults.disconnect ? '✅' : '❌'}`);
        
        const allPassed = Object.values(testResults).every(result => result);
        
        if (allPassed) {
            console.log('\n🎉 All tests passed! Signaling server is working correctly.');
            process.exit(0);
        } else {
            console.log('\n❌ Some tests failed. Check the server logs.');
            process.exit(1);
        }
        
    } catch (error) {
        console.error('\n💥 Test failed:', error.message);
        process.exit(1);
    }
}

// Handle command line arguments
if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log('GameWork Signaling Server Test');
    console.log('');
    console.log('Usage: node test-server.js [options]');
    console.log('');
    console.log('Options:');
    console.log('  --help, -h     Show this help message');
    console.log('  --url URL      Test against specific server URL');
    console.log('');
    console.log('Environment Variables:');
    console.log('  SERVER_URL     WebSocket server URL (default: ws://localhost:8080)');
    console.log('');
    process.exit(0);
}

// Check for custom URL
const urlIndex = process.argv.indexOf('--url');
if (urlIndex !== -1 && process.argv[urlIndex + 1]) {
    process.env.SERVER_URL = process.argv[urlIndex + 1];
}

main();




