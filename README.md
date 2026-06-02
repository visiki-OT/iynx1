# IYNX1 - Incident Command Center Edge Gateway

## Project State: Factory Acceptance Testing (FAT) Phase
IYNX1 is a standalone, cross-platform (desktop/mobile) Incident Command Center designed to support emergency deployment, tactical communication relays, and real-time data triage during disaster recovery operations.

### Core Capabilities & Verified Modules

* **RF Signal Triage & AI Interpretation:** Features an edge RF data intake pipeline that captures wireless communication via a local hardware interface (e.g., Nooelec SDR v5). Incoming audio payloads are buffered, transcribed, and instantly interpreted via local AI to issue automated tactical reports and dynamic limit alarms.
* **Environmental Satellite Telemetry:** Equipped with a secure data intake engine that pulls satellite tracking data (e.g., NASA FIRMS thermal anomaly mapping) and environmental weather arrays. It parses raw telemetry data inputs directly into immediate geospatial reports and priority warning triggers.
* **Sovereign Telemetry Relay:** Utilizes a local Node.js Express architecture hosting an embedded Aedes MQTT broker (TCP 1883 / WS 8888) to route critical edge alerts, equipment snapshots, and sensor strings across a local area network without requiring an active internet connection.

### Permissive Integration Architecture
The IYNX1 Incident Command Center is built to seamlessly consume independent, permissive open-source components to maintain structural agility:
* **SYRINX1 Integration:** Integrates standalone, MIT-licensed Web Audio engines to synthesize high-performance auditory indicators and prevent operator fatigue.
* **GALATEA1 Integration:** Enforces high-performance Human-Machine Interface (HMI) rendering rules, utilizing a permissive SVG object factory for mapping and symbology toggles.

