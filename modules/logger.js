import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Creates a log file one level up in the main directory
const logPath = path.join(__dirname, '../iynx1-telemetry.log');
const logStream = fs.createWriteStream(logPath, { flags: 'a' });

export const logEvent = (eventData) => {
    const logEntry = `${new Date().toISOString()} | ${JSON.stringify(eventData)}\n`;
    logStream.write(logEntry);
};