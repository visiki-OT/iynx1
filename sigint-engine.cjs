const { spawn } = require('child_process');
const http = require('http');
const mqtt = require('mqtt');

const mqttClient = mqtt.connect('mqtt://broker.emqx.io:1883');
mqttClient.on('connect', () => {
    console.log('✅ Connected to Public EMQX MQTT Broker');
});

const WHISPER_DEVICE_ID = "1"; 

const SYSTEM_PROMPT = `
You are a tactical SIGINT analyst. Extract actionable traffic/weather/emergencies.
If no events are found, return exactly: {"relevant": false}
If an event is found, return a JSON object with details. Include a "relevant": true key.
Output raw JSON only.
`;

async function analyzeWithMistral(textBlock) {
    const payload = JSON.stringify({
        model: "mistral",
        format: "json", // Forces Ollama to stick to valid JSON
        messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: textBlock }
        ],
        stream: false,
        options: { temperature: 0.1 }
    });

    const options = {
        hostname: '127.0.0.1',
        port: 11434,
        path: '/api/chat',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    };

    const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
            try {
                const responseObj = JSON.parse(data);
                const intelligence = JSON.parse(responseObj.message.content.trim());
                
                // NEW: Smarter check to catch Mistral's advanced schemas
                if (intelligence.relevant || intelligence.traffic || intelligence.emergencies || intelligence.category) {
                    console.log("\n🚨 [INTELLIGENCE DETECTED] 🚨");
                    console.log(JSON.stringify(intelligence, null, 2));
                    
                    mqttClient.publish('telemetry/sigint', JSON.stringify(intelligence));
                    console.log("-> 📡 Published to MQTT Broker");
                } else {
                    process.stdout.write("."); 
                }
            } catch (e) {
                // Ignore silent parsing errors on noise
            }
        });
    });

    req.on('error', (e) => {});
    req.write(payload);
    req.end();
}

console.log(`Initializing Local SIGINT Pipeline Targeting Device ID [${WHISPER_DEVICE_ID}]...`);
const whisperProcess = spawn('./build/bin/whisper-stream', [
    '-m', 'models/ggml-base.en.bin', '-t', '8', '--step', '4000', '--length', '8000', '-c', WHISPER_DEVICE_ID
], { cwd: './whisper.cpp' }); 

let buffer = '';
whisperProcess.stdout.on('data', (data) => {
    buffer += data.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop(); 

    for (const line of lines) {
        const cleanedLine = line.trim();
        if (cleanedLine && !cleanedLine.startsWith('main:') && !cleanedLine.includes('[BLANK_AUDIO]')) {
            console.log(`\n[Radio Capture]: ${cleanedLine}`);
            analyzeWithMistral(cleanedLine);
        }
    }
});

// NEW: Auto-Test Injector
setTimeout(() => {
    console.log("\n[SYSTEM TEST] 🧪 Injecting mock radio intercept directly into the engine...");
    analyzeWithMistral("This is 100.3 The Bear traffic update. We have a massive three-vehicle collision on the Anthony Henday northbound right at Whitemud Drive blocking both lanes. Emergency crews are on scene.");
}, 5000);