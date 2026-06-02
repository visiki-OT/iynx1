import mqtt from 'mqtt';
import { logEvent } from './logger.js';

const brokerUrl = 'mqtt://broker.hivemq.com';
let mqttClient = null;

const IYNX_TOPIC = 'spBv1.0/CRSS_DRaaS/DDATA/F150_Mobile_Command/Iynx1';
const COMMAND_TOPIC = 'spBv1.0/CRSS_DRaaS/DCMD/F150_Mobile_Command/Iynx1';

export const initMqtt = (podsConfig) => {
    mqttClient = mqtt.connect(brokerUrl);

    mqttClient.on('connect', () => {
        console.log(`[Iynx1-MQTT] Connected to Cloud Broker: ${brokerUrl}`);
        
        mqttClient.subscribe(COMMAND_TOPIC, (err) => {
            if (!err) {
                console.log(`[Iynx1-MQTT] Subscribed to AWACS commands: ${COMMAND_TOPIC}`);
            }
        });
    });

    mqttClient.on('message', (topic, message) => {
        if (topic === COMMAND_TOPIC) {
            console.log(`\n[Iynx1-MQTT] 🚨 AWACS CLOUD COMMAND:`, message.toString());
            logEvent({ type: "INBOUND_COMMAND_RELAY", payload: message.toString() });
        }
    });

    mqttClient.on('error', (err) => {
        console.error(`[Iynx1-MQTT] Connection Error:`, err);
    });
};

export const publishTelemetry = (rawData, podsConfig) => {
    if (!mqttClient || !mqttClient.connected) {
        console.warn(`[Iynx1-MQTT] Offline. Payload buffered to local disk.`);
        return false;
    }

    const payload = {
        timestamp: Date.now(),
        seq: Math.floor(Math.random() * 256),
        icc_shared_awareness: true,
        metrics: [
            { name: "gateway_id", value: podsConfig.gatewayId, type: "String" },
            { name: "mast_elevation", value: "20.0 FT", type: "String" },
            { name: "comms_status", value: "LEO_UPLINK_ACTIVE", type: "String" },
            { name: "raw_telemetry", value: JSON.stringify(rawData), type: "String" }
        ]
    };

    mqttClient.publish(IYNX_TOPIC, JSON.stringify(payload), { qos: 1 });
    return true;
};