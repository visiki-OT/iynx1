import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { Aedes } from 'aedes';
import { createServer } from 'net';
import { createServer as createHttpServer } from 'http';
import websocketStream from 'websocket-stream';
import mqtt from 'mqtt';
import 'dotenv/config';

// Recreate __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001; // Moved to 3001 to prevent conflict with ECHO1

// 1. Explicitly serve static files from the 'public' folder
app.use(express.static(path.join(__dirname, 'public')));

// 2. Fallback route to ensure any root hit returns our clean index.html dashboard
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 3. Simple JSON API stub for our PTT (Push-To-Talk) and GPS updates
app.use(express.json());
app.post('/api/voice-command', (req, res) => {
    console.log("🎙️ [server.js] Voice payload intercept received at Edge.");
    res.json({ status: "success", message: "Audio buffered locally." });
});

// 4. Stand up the Sovereign Aedes MQTT Broker
const aedes = await Aedes.createBroker();
const mqttServer = createServer(aedes.handle);
const MQTT_PORT = 1883; // Standard MQTT port

mqttServer.listen(MQTT_PORT, () => {
    console.log(`📡 [IYNX1] Sovereign MQTT Broker active on port ${MQTT_PORT}`);
});

// 5. Stand up the WebSocket Translator for the Frontend Dashboard
const wsServer = createHttpServer();
websocketStream.createServer({ server: wsServer }, aedes.handle);
const WS_PORT = 8888;

wsServer.listen(WS_PORT, () => {
    console.log(`🌐 [IYNX1] WebSocket Translator active on port ${WS_PORT}`);
});

// Log when devices connect/disconnect to monitor the local traffic
aedes.on('client', (client) => {
    console.log(`🔌 [MQTT] Device Connected: ${client ? client.id : 'unknown'}`);
});

aedes.on('clientDisconnect', (client) => {
    console.log(`🛑 [MQTT] Device Disconnected: ${client ? client.id : 'unknown'}`);
});

// 6. NASA FIRMS Polling Service (Edge Telemetry Engine)
const localGatewayClient = mqtt.connect('mqtt://localhost:1883');

localGatewayClient.on('connect', () => {
    console.log('🤖 [IYNX1] Local Node.js Gateway Client connected to Sovereign Broker');
});

// Haversine formula to calculate distance between two lat/lng points in km
function getDistanceKm(lat1, lon1, lat2, lon2) {
    const R = 6371; 
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
}

async function fetchFirmsData() {
    console.log("🔥 [IYNX1] Fetching KEYLESS NASA FIRMS Open Data (Global 24h CSV)...");
    
    try {
        // NASA Open Data requires NO MAP_KEY. Sovereign, static CSV fetch.
        const url = `https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-20-viirs-c2/csv/J1_VIIRS_C2_Global_24h.csv`;
        
        const response = await fetch(url, {
            headers: { 'User-Agent': 'VISIKI-OT-Edge-Gateway/1.0' }
        });
        
        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`NASA Open Data returned HTTP ${response.status} - ${errorBody}`);
        }
        
        const csvText = await response.text();
        
        // Catch HTML redirects (e.g., NASA maintenance pages returning HTTP 200)
        if (csvText.includes("<!DOCTYPE") || csvText.toLowerCase().includes("<html")) {
            throw new Error("NASA API returned an HTML page (Likely a maintenance block).");
        }

        const lines = csvText.trim().split('\n');
        
        // Dynamically map columns to remain bulletproof against NASA schema changes
        const header = lines.shift().toLowerCase().split(',');
        const latIdx = header.findIndex(c => c.includes('lat'));
        const lonIdx = header.findIndex(c => c.includes('lon') || c.includes('lng'));
        const confIdx = header.findIndex(c => c.includes('conf'));
        const frpIdx = header.findIndex(c => c.includes('frp'));
        
        if (latIdx === -1 || lonIdx === -1) {
            throw new Error("NASA payload missing latitude/longitude columns.");
        }

        // Basecamp Coordinates (Edmonton HQ)
        const hqLat = 53.5461;
        const hqLng = -113.4938;

        let parsedFires = lines.map((line, index) => {
            const cols = line.split(',');
            if (cols.length < Math.max(latIdx, lonIdx)) return null;
            
            // Safely parse VIIRS or MODIS confidence dynamically
            let parsedConfidence = 100; // Default to 100 if missing
            if (confIdx !== -1 && cols[confIdx]) {
                const confStr = String(cols[confIdx]).trim().toLowerCase();
                if (confStr === 'h' || confStr === 'high') parsedConfidence = 100;
                else if (confStr === 'n' || confStr === 'nominal') parsedConfidence = 75;
                else if (confStr === 'l' || confStr === 'low') parsedConfidence = 25;
                else parsedConfidence = parseInt(confStr) || 0;
            }

            const fire = {
                id: `FIRMS-OPEN-${Date.now()}-${index}`, // Bulletproof ID generation
                lat: parseFloat(cols[latIdx]),
                lng: parseFloat(cols[lonIdx]),
                confidence: parsedConfidence,
                frp: frpIdx !== -1 ? parseFloat(cols[frpIdx]) : 15
            };
            
            // Calculate Threat Level based on distance to Basecamp and intensity
            fire.distance = getDistanceKm(hqLat, hqLng, fire.lat, fire.lng);
            
            // Final Wildfire Logic: Cascading Intensity & Distance Array
            if (fire.distance < 10) {
                fire.status = 'CRITICAL'; // P1: Closer than 10km (Evacuate)
            } else if (fire.frp > 50) {
                fire.status = 'WARNING'; // P2: Over 50 MW
            } else if (fire.frp > 10) {
                fire.status = 'ADVISORY'; // P3: Over 10 MW
            } else {
                fire.status = 'NORMAL'; // P4: The rest of the 100 closest targets
            }
            
            return fire; 
        }).filter(f => f !== null && !isNaN(f.lat) && f.confidence > 40);

        // Sort by closest proximity to Basecamp and cap at 100 targets to prevent payload bloat
        parsedFires.sort((a, b) => a.distance - b.distance);
        const tacticalFires = parsedFires.slice(0, 100);

        const payload = {
            source: "NASA_FIRMS_OPEN_DATA",
            timestamp: new Date().toISOString(),
            fires: tacticalFires
        };
        
        // Use MQTT 'retain' so any new dashboard joining the network immediately gets the last known state
        localGatewayClient.publish('telemetry/firms', JSON.stringify(payload), { retain: true });
        console.log(`✅ [IYNX1] Published ${tacticalFires.length} tactical fire targets to Edge Broker (Retained).`);
        
    } catch (error) {
        console.error("🔴 [IYNX1] External Telemetry Fetch Failed:", error.message);
        console.log("⚠️ [IYNX1] Feed invalid. Retaining [--] Offline UI state.");
    }
}

// Start polling sequence (Initial fetch after 5s, then every 10 minutes)
setTimeout(() => {
    fetchFirmsData();
    setInterval(fetchFirmsData, 600000);
}, 5000);

app.listen(PORT, () => {
    console.log(`==================================================`);
    console.log(`🟢 IYNX1 CORE GATEWAY ONLINE: http://localhost:${PORT}`);
    console.log(`📍 Serving Mobile Incident Command Dashboard`);
    console.log(`==================================================`);
});