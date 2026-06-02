const aedesLib = require('aedes');
const Aedes = aedesLib.Aedes || aedesLib.Server || aedesLib.default || aedesLib;
const aedes = new Aedes();

const net = require('net');
const http = require('http');
const { WebSocketServer } = require('ws');

// 1. Core TCP Broker (This is rock solid, we know this works)
const tcpServer = net.createServer(aedes.handle);
tcpServer.listen(1883, '127.0.0.1', () => console.log('[Aedes] TCP Broker on port 1883'));

// 2. WebSocket-to-TCP Proxy (Bypasses Aedes' broken WS handler entirely)
const httpServer = http.createServer();
const wss = new WebSocketServer({ 
    server: httpServer,
    handleProtocols: () => 'mqtt' // Keeps the browser handshake happy
});

wss.on('connection', (ws) => {
    console.log('[Proxy] 🌐 Browser connected! Piping raw binary to TCP...');
    
    // Connect locally to our own working TCP port
    const tcpSocket = net.connect(1883, '127.0.0.1');
    
    // Pipe data perfectly back and forth
    ws.on('message', (msg) => tcpSocket.write(msg));
    tcpSocket.on('data', (data) => ws.send(data));
    
    // Cleanup on disconnect
    ws.on('close', () => tcpSocket.end());
    tcpSocket.on('close', () => ws.close());
    ws.on('error', () => tcpSocket.destroy());
    tcpSocket.on('error', () => ws.close());
});

httpServer.listen(8888, '0.0.0.0', () => console.log('[Aedes] WebSocket Proxy on port 8888'));

// 3. Traffic Logging
aedes.on('client', (client) => {
    console.log(`[Broker] ✅ Client Linked: ${client ? client.id : 'Unknown'}`);
});
aedes.on('publish', (packet, client) => {
    if (client && !packet.topic.startsWith('$SYS')) { 
        console.log(`[Broker] 📡 Message routed to: ${packet.topic}`);
    }
});
