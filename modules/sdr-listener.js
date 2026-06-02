import { spawn } from 'child_process';
import { publishTelemetry } from './mqtt-gateway.js';
import { logEvent } from './logger.js';

export const startSdrListener = (podsConfig) => {
    console.log(`[Iynx1-SDR] 📡 Booting RTL-SDR Hardware Listener...`);
    
    // Commands to tune the radio to NOAA weather satellites at 137.62 MHz
    const sdrProcess = spawn('rtl_fm', [
        '-M', 'fm', '-f', '137.62M', '-s', '60k', '-g', '45', '-p', '55', '-E', 'wav', '-'
    ]);

    sdrProcess.stdout.on('data', (data) => {
        if (data.length > 1024) {
            logEvent({ type: "SDR_BUFFER_RECEIVED", bytes: data.length });
            
            // Random sample limiter to prevent flooding the MQTT broker
            if (Math.random() > 0.99) { 
                publishTelemetry({ 
                    source: "Nooelec_SDR", 
                    status: "ACTIVE_RECEIVING",
                    frequency: "137.62 MHz",
                    buffer_size: data.length
                }, podsConfig);
            }
        }
    });

    sdrProcess.on('error', (err) => {
        // This catches the error when the Nooelec hardware isn't plugged in yet (Expected before Monday)
        console.log(`[Iynx1-SDR] ⚠️ Hardware driver not detected. SDR module idling until dongle is connected.`);
    });
};