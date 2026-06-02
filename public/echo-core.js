/**
 * ECHO//1 - The Master Core Orchestrator
 * Manages UI view switching, local MQTT event distribution, and PTT sovereignty
 */

const EchoCore = {
    state: {
        currentWorkspace: 'pipeline-sim',
        isMicActive: false,
        mqttConnected: false,
        showFirms: true,
        isAlarmsMuted: true, // Start muted to allow operator to manually unlock Web Audio API
        activeAlarms: new Map(), // Tracks active alarms to prevent duplicate stacking
        pattersonInterval: null // Governs the audio loop timing
    },

    // The Master Hardware Config Database
    SYSTEM_ROSTER: {
        'leo': { id: 'leo', label: 'LEO', hw: 'STARLINK MINI', status: 'CONNECTED', color: '#10b981' }, 
        'cell': { id: 'cell', label: 'CELL', hw: 'PEPLINK BR1 PRO', status: 'STANDBY', color: '#888888' }, 
        'rf': { id: 'rf', label: 'RF INT', hw: 'NOOELEC SDR V5', status: 'ACTIVE', color: '#333333' },
        'mesh': { id: 'mesh', label: 'MESH', hw: 'HELTEC V3 LORA', status: 'ACTIVE (3)', color: '#10b981' },
        'audio': { id: 'audio', label: 'AUDIO', hw: 'JABRA SPEAK 510', status: 'PTT READY', color: '#555555' }, 
        'perimeter': { id: 'perimeter', label: 'PERIM', hw: 'ESP-WROOM-32', status: 'ARMED', color: '#555555' },
        'power': { id: 'power', label: 'POWER', hw: '2U UPS MODULE', status: 'MAINS AC', color: '#555555' },
        'firms': { id: 'firms', label: 'FIRMS', hw: 'NASA GEOJSON API (MQTT BRIDGE)', status: 'SYNCED', color: '#10b981' }
    },

    init() {
        console.log("⚡ EchoCore Orchestrator Initializing...");
        
        // 1. Bind UI Elements
        this.workspaceSelector = document.getElementById('workspace-selector');
        this.pttButton = document.getElementById('ptt-mic-btn');
        this.statusIndicator = document.getElementById('connection-indicator');
        
        // 2. Setup Event Listeners
        this.bindEvents();
        
        // 3. Set Initial Workspace View
        this.switchWorkspace(this.workspaceSelector.value);

        // 4. Connect to Sovereign MQTT Broker
        this.connectMqtt();

        // 5. Boot Geospatial Map Engine
        this.initMapEngine();

        // 6. Initialize Audio HMI
        this.updateMuteBtnUI();

        // 7. Render Base Map Controls (Renders even if external feeds are offline)
        this.renderMapControls();
    },

    bindEvents() {
        // Workspace selection changer
        this.workspaceSelector.addEventListener('change', (e) => {
            this.switchWorkspace(e.target.value);
        });

        // Q2 Tab Switcher & Submenu Delegate Logic
        document.addEventListener('click', (e) => {
            // Main Q2 Tabs
            if (e.target.id && e.target.id.startsWith('tab-btn-')) {
                const tabName = e.target.id.replace('tab-btn-', '');
                
                // Reset all main tabs
                document.querySelectorAll('[id^="tab-btn-"]').forEach(btn => {
                    btn.className = "flex-1 py-2 px-4 border-r border-[#333333] font-heading text-[12px] text-[#333333] hover:bg-[#D0D0D0] transition-colors";
                });
                
                // Activate clicked main tab
                e.target.className = "flex-1 py-2 px-4 border-r border-[#333333] font-heading text-[12px] bg-[#37474F] text-white transition-colors";
                
                // Hide all content panels, show the active one
                document.querySelectorAll('[id^="tab-content-"]').forEach(content => content.classList.add('hidden'));
                const activeContent = document.getElementById('tab-content-' + tabName);
                if (activeContent) {
                    activeContent.classList.remove('hidden');
                    if (tabName === 'detail' && EchoCore.mapQ2) {
                        setTimeout(() => EchoCore.mapQ2.invalidateSize(), 50);
                    }
                }
            }

            // Q2 Submenu Delegate Click
            if (e.target.classList.contains('sys-submenu-btn')) {
                const sysId = e.target.getAttribute('data-sys');
                this.loadSystemDetail(sysId);
            }

            // Q2 Subsystem Visibility Checkbox Delegate
            if (e.target.classList.contains('sys-visibility-toggle')) {
                const sysId = e.target.getAttribute('data-sys');
                const isVisible = e.target.checked;
                
                // Update Master Roster State
                if (EchoCore.SYSTEM_ROSTER[sysId]) {
                    EchoCore.SYSTEM_ROSTER[sysId].visible = isVisible;
                }
                
                // Instantly Toggle Q3 Row Visibility
                const row = document.querySelector(`tr[data-sys="${sysId}"]`);
                if (row) {
                    row.style.display = isVisible ? '' : 'none';
                }
            }
        });

        // Q3 Row Click -> Q2 System Tab Linker
        const q3Rows = document.querySelectorAll('#q3-telemetry tbody tr');
        q3Rows.forEach(row => {
            row.addEventListener('click', () => {
                // Apply Magenta Selection HPHMI
                q3Rows.forEach(r => r.classList.remove('hphmi-selected'));
                row.classList.add('hphmi-selected');

                const sysId = row.getAttribute('data-sys');
                if (sysId) {
                    // Force Q2 to switch to the SYSTEM tab
                    const systemTabBtn = document.getElementById('tab-btn-system');
                    if (systemTabBtn) systemTabBtn.click();
                    
                    // Render the clicked system's details
                    this.loadSystemDetail(sysId);
                }
            });
        });

        // Push-To-Talk Mouse / Touch Interactions
        if (this.pttButton) {
            this.pttButton.addEventListener('mousedown', () => this.startVoiceCapture());
            this.pttButton.addEventListener('mouseup', () => this.stopVoiceCapture());
            this.pttButton.addEventListener('mouseleave', () => this.stopVoiceCapture()); // Safety abort
        }

        // Push-To-Talk Keyboard Interaction & FAT Hotkeys
        window.addEventListener('keydown', (e) => {
            // Safety: Ignore hotkeys if the operator is typing in a text box
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;

            // PTT Spacebar Hotkey
            if (e.code === 'Space' && !e.repeat) {
                e.preventDefault(); 
                this.startVoiceCapture();
            }

            // Hidden Developer Hotkeys for Audio FAT Testing
            if (['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'].includes(e.code)) {
                const priority = parseInt(e.key);
                this.triggerAlarm(priority, `SYS FAT: SIMULATED PRIORITY ${priority} ALARM`, `fat-test-${Date.now()}`);
            }
        });

        window.addEventListener('keyup', (e) => {
            if (e.code === 'Space') {
                this.stopVoiceCapture();
            }
        });

        // Global Mute Toggle
        const muteBtn = document.getElementById('btn-mute-alarms');
        if (muteBtn) {
            muteBtn.addEventListener('click', () => {
                this.state.isAlarmsMuted = !this.state.isAlarmsMuted;
                this.updateMuteBtnUI();
                if (!this.state.isAlarmsMuted && typeof Syrinx !== 'undefined') {
                    Syrinx.playAlarm(4, false); // Play a test chime on unmute
                }
                this.evalPattersonLoop();
            });
        }

        // Acknowledge All Alarms
        const ackBtn = document.getElementById('btn-ack-all');
        if (ackBtn) {
            ackBtn.addEventListener('click', () => {
                const alarmList = document.getElementById('q4-alarm-list');
                if (alarmList) alarmList.innerHTML = '';
                this.state.activeAlarms.clear();
                this.evalPattersonLoop();
            });
        }
    },

    evalPattersonLoop() {
        if (this.state.pattersonInterval) {
            clearInterval(this.state.pattersonInterval);
            this.state.pattersonInterval = null;
        }
        if (this.state.isAlarmsMuted) return;

        let highestPriority = 5;
        this.state.activeAlarms.forEach((p) => {
            if (p < highestPriority) highestPriority = p;
        });

        const intervals = { 1: 5000, 2: 8000, 3: 13000, 4: 60000 };
        if (highestPriority < 5 && intervals[highestPriority]) {
            this.state.pattersonInterval = setInterval(() => {
                if (typeof Syrinx !== 'undefined' && !this.state.isAlarmsMuted) {
                    Syrinx.playAlarm(highestPriority, false);
                }
            }, intervals[highestPriority]);
        }
    },

    updateMuteBtnUI() {
        const muteBtn = document.getElementById('btn-mute-alarms');
        if (!muteBtn || typeof Galatea === 'undefined') return;
        muteBtn.innerHTML = Galatea.getAudioIcon(this.state.isAlarmsMuted);
        
        // Visual indicator when muted (Orange border warning)
        if (this.state.isAlarmsMuted) {
            muteBtn.classList.replace('border-[#777777]', 'border-[#F57C00]');
            muteBtn.classList.replace('text-[#333333]', 'text-[#F57C00]');
        } else {
            muteBtn.classList.replace('border-[#F57C00]', 'border-[#777777]');
            muteBtn.classList.replace('text-[#F57C00]', 'text-[#333333]');
        }
    },

    loadSystemDetail(sysId) {
        if (typeof Galatea === 'undefined') {
            console.error("🔴 GALATEA1 library not found!");
            return;
        }
        const subMount = document.getElementById('q2-submenu-mount');
        const detMount = document.getElementById('q2-detail-mount');
        if (!subMount || !detMount) return;

        // 1. Generate Submenu Row
        let subHtml = '';
        Object.values(this.SYSTEM_ROSTER).forEach(sys => {
            subHtml += Galatea.createSubmenuBtn(sys.id, sys.label, sys.id === sysId);
        });
        subMount.innerHTML = subHtml;

        // 2. Generate the Detail Card
        const data = this.SYSTEM_ROSTER[sysId];
        if (data) {
            detMount.innerHTML = Galatea.createSystemDetailCard(data);
        }
    },

    switchWorkspace(mode) {
        console.log(`🌐 Switching Echo1 Workspace Mode to: [${mode.toUpperCase()}]`);
        this.state.currentWorkspace = mode;
        
        const workspaceEvent = new CustomEvent('workspaceChanged', { detail: { mode: mode } });
        window.dispatchEvent(workspaceEvent);

        document.querySelectorAll('.workspace-panel').forEach(panel => {
            if (panel.id === `${mode}-panel`) {
                panel.classList.remove('hidden');
            } else {
                panel.classList.add('hidden');
            }
        });
    },

    initMapEngine() {
        console.log("🗺️ Booting Leaflet.js Geospatial Engine...");
        
        const mapMount = document.getElementById('map-container');
        if (!mapMount || typeof L === 'undefined') return;

        this.map = L.map('map-container', { zoomControl: false }).setView([53.5461, -113.4938], 11);

        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            attribution: 'VISIKI OT Sovereign Edge',
            maxZoom: 19
        }).addTo(this.map);

        // Initialize Semantic Zoom Layer Groups
        this.layerCritical = L.layerGroup().addTo(this.map);
        this.layerNormal = L.layerGroup().addTo(this.map);

        // Semantic Zoom Logic: Hide normal telemetry when zoomed out past level 10
        this.map.on('zoomend', () => {
            this.applyFirmsVisibility();
        });

        this.mcuMarker = L.circleMarker([53.5461, -113.4938], {
            color: '#ba1a1a',      
            fillColor: '#ba1a1a',
            fillOpacity: 0.5,
            radius: 8
        }).addTo(this.map);

        this.mcuMarker.bindPopup('<b style="font-family: Roboto Mono;">IYNX-MCU-01</b><br>Awaiting NMEA Serial Data...');

        // Attach Yoking Logic to Marker
        this.mcuMarker.on('click', () => {
            this.selectMapTarget(this.mcuMarker, 53.5461, -113.4938, "IYNX-MCU-01 [HQ]", "STATUS: ONLINE<br>PWR: MAINS AC<br>RF: NOOELEC SDR V5");
        });

        // Initialize Q2 Detail Map
        const q2MapMount = document.getElementById('q2-map-container');
        if (q2MapMount) {
            this.mapQ2 = L.map('q2-map-container', { zoomControl: false, attributionControl: false }).setView([53.5461, -113.4938], 16);
            L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
                maxZoom: 19
            }).addTo(this.mapQ2);
            
            this.q2Marker = L.circleMarker([53.5461, -113.4938], {
                color: '#ba1a1a',      
                fillColor: '#ba1a1a',
                fillOpacity: 0.8,
                radius: 12
            }).addTo(this.mapQ2);
        }
    },

    focusTargetDetail(lat, lng, title, telemetryData) {
        // 1. Force Q2 to switch to DETAIL tab
        const detailTabBtn = document.getElementById('tab-btn-detail');
        if (detailTabBtn) detailTabBtn.click();

        // 2. Pan/Zoom Q2 Map and update marker
        if (this.mapQ2 && this.q2Marker) {
            this.mapQ2.setView([lat, lng], 16);
            this.q2Marker.setLatLng([lat, lng]);
        }

        // 3. Inject Telemetry Data
        const dataContainer = document.getElementById('q2-target-data');
        if (dataContainer) {
            dataContainer.innerHTML = `
                <div class="mb-2"><span class="text-[#333333]">TARGET ID:</span> <span class="text-[#ba1a1a]">${title}</span></div>
                <div class="mb-2"><span class="text-[#333333]">COORDINATES:</span> ${lat.toFixed(4)}, ${lng.toFixed(4)}</div>
                <div class="p-3 bg-[#E8E8E8] border border-outline-variant mt-3">${telemetryData}</div>
            `;
        }
    },

    connectMqtt() {
        console.log("🔌 Connecting to Sovereign MQTT Broker via WebSockets...");
        this.mqttClient = mqtt.connect('ws://localhost:8888');

        this.mqttClient.on('connect', () => {
            console.log("🟢 Dashboard connected to MQTT Broker");
            this.updateMqttStatus(true);
            this.triggerAlarm(5, "UPLINK ESTABLISHED WITH SOVEREIGN MQTT BROKER", "sys-mqtt");
            
            // Subscribe to Sovereign Edge Topics
            this.mqttClient.subscribe('telemetry/firms');
        });

        this.mqttClient.on('message', (topic, message) => {
            if (topic === 'telemetry/firms') {
                try {
                    const payload = JSON.parse(message.toString());
                    this.handleFirmsTelemetry(payload);
                } catch (e) {
                    console.error("🔴 Failed to parse FIRMS telemetry payload:", e);
                }
            }
        });

        this.mqttClient.on('offline', () => {
            this.updateMqttStatus(false);
            this.triggerAlarm(2, "WARN: BROKER CONNECTION LOST. RETRYING...", "sys-mqtt");
        });
    },

    logSystemMessage(msg, isWarning = false) {
        const logBox = document.getElementById('logStream');
        if (!logBox) return;
        const time = new Date().toLocaleTimeString('en-US', { hour12: false });
        const color = isWarning ? 'text-[#F57C00]' : 'text-[#333333]';
        logBox.innerHTML += `<div><span class="text-[#777777]">[${time}]</span> <span class="${color}">${msg}</span></div>`;
        logBox.scrollTop = logBox.scrollHeight; 
    },

    triggerAlarm(priority, message, targetId) {
        // Prevent duplicate spam if the alarm is already active
        if (this.state.activeAlarms.has(targetId)) return;
        this.state.activeAlarms.set(targetId, priority);

        const alarmList = document.getElementById('q4-alarm-list');
        if (!alarmList || typeof Galatea === 'undefined') return;
        
        // Fetch centralized symbology from Galatea
        const hphmi = Galatea.getHphmiIcon(priority);
        const time = new Date().toLocaleTimeString('en-US', { hour12: false });
        
        const alarmHtml = `
            <div class="grid grid-cols-[100px_1fr] px-6 items-center border-b border-outline-variant h-[40px] hover:bg-[#E8E8E8] cursor-pointer transition-colors" data-target="${targetId}">
                <div class="flex items-center gap-2 w-[85px]">
                    <div class="flex items-center justify-center w-[16px] h-[16px] shrink-0">${hphmi.html}</div>
                    <span class="font-mono text-xs font-bold text-[#333333] ml-2">${time}</span>
                </div>
                <span class="text-xs font-bold text-[#333333] uppercase tracking-widest truncate">${message}</span>
            </div>
        `;
        // Prepend so newest is on top
        alarmList.innerHTML = alarmHtml + alarmList.innerHTML;

        // Trigger Syrinx Web Audio
        if (typeof Syrinx !== 'undefined') {
            Syrinx.playAlarm(priority, this.state.isAlarmsMuted);
        }
        
        this.evalPattersonLoop();
    },

    updateMqttStatus(connected) {
        this.state.mqttConnected = connected;
        if (connected) {
            this.statusIndicator.classList.remove('bg-[#ba1a1a]', 'shadow-[0_0_8px_rgba(186,26,26,0.5)]');
            this.statusIndicator.classList.add('bg-[#10b981]', 'shadow-[0_0_8px_rgba(16,185,129,0.5)]');
            this.statusIndicator.title = "MQTT Broker Connected";
        } else {
            this.statusIndicator.classList.remove('bg-[#10b981]', 'shadow-[0_0_8px_rgba(16,185,129,0.5)]');
            this.statusIndicator.classList.add('bg-[#ba1a1a]', 'shadow-[0_0_8px_rgba(186,26,26,0.5)]');
            this.statusIndicator.title = "MQTT Broker Disconnected";
        }
    },

    startVoiceCapture() {
        if (this.state.isMicActive) return; 
        
        this.state.isMicActive = true;
        
        // Check if button exists before trying to modify it
        if (this.pttButton) {
            this.pttButton.classList.add('recording');
            const micText = this.pttButton.querySelector('.mic-text');
            if (micText) micText.innerText = "LIVE INTERCOM: RECORDING";
        }
        
        console.log("🎙️ [Sovereignty Mode] Edge microphone active. Capturing local audio buffer...");
        
        if (window.SyrinxAudioEngine) {
            window.SyrinxAudioEngine.startRecording();
        }
    },

    stopVoiceCapture() {
        if (!this.state.isMicActive) return; 
        
        this.state.isMicActive = false;
        
        if (this.pttButton) {
            this.pttButton.classList.remove('recording');
            const micText = this.pttButton.querySelector('.mic-text');
            if (micText) micText.innerText = "PTT: MIC MUTED";
        }
        
        console.log("🔒 [Sovereignty Mode] Microphone instantly severed. Processing local buffer at edge.");
        
        if (window.SyrinxAudioEngine) {
            const audioBlob = window.SyrinxAudioEngine.stopRecording();
            this.forwardAudioToEdgeCore(audioBlob);
        }
    },

    forwardAudioToEdgeCore(audioBlob) {
        console.log("📦 Deserializing audio stream for local Node.js loop...");
    },

    handleFirmsTelemetry(payload) {
        console.log(`🔥 [MQTT] Processing FIRMS Payload: ${payload.fires.length} targets detected.`);
        
        if (typeof Galatea === 'undefined') return;

        // Clear existing FIRMS markers so we don't stack duplicates on polling updates
        if (this.firmsMarkers) {
            this.firmsMarkers.forEach(m => {
                this.layerNormal.removeLayer(m);
                this.layerCritical.removeLayer(m);
            });
        }
        this.firmsMarkers = [];

        // Parse Payload
        const incomingFirmsIds = new Set();
        
        payload.fires.forEach(fire => {
            incomingFirmsIds.add(fire.id);
            let priority = 5; // Default Priority 5 (Info)
            let targetLayer = this.layerNormal; // Defaults to semantic zoom hiding
            let statusText = "NORMAL (OUTSIDE GEOFENCE)";

            if (fire.status === "CRITICAL") {
                priority = 1;
                targetLayer = this.layerCritical; // Persists on zoom out
                statusText = "CRITICAL (EXCLUSION ZONE)";
                this.triggerAlarm(1, `FIRMS: CRITICAL FIRE FRONT [${fire.id}]`, fire.id);
            } else if (fire.status === "WARNING") {
                priority = 2;
                targetLayer = this.layerCritical;
                statusText = "WARNING (INSIDE GEOFENCE)";
                this.triggerAlarm(2, `FIRMS: THERMAL ANOMALY [${fire.id}]`, fire.id);
            } else if (fire.status === "ADVISORY") {
                priority = 3;
                targetLayer = this.layerCritical; // Let P3s persist on zoom out so we can track provincial threats
                statusText = "ADVISORY (PROVINCIAL HIGH FRP)";
                this.triggerAlarm(3, `FIRMS: HIGH INTENSITY ANOMALY [${fire.id}]`, fire.id);
            } else if (fire.status === "NORMAL") {
                priority = 4;
                targetLayer = this.layerNormal;
                statusText = "MONITORING (P4 FALLBACK)";
                this.triggerAlarm(4, `FIRMS: DISTANT ANOMALY [${fire.id}]`, fire.id);
            }

            // Generate Map SVG via Galatea
            const hphmiDef = Galatea.getHphmiIcon(priority);
            const icon = L.divIcon({ html: hphmiDef.html, className: '', iconSize: hphmiDef.size });

            // Drop Marker onto specified layer
            const marker = L.marker([fire.lat, fire.lng], { icon: icon }).addTo(targetLayer);
            marker.on('click', () => this.selectMapTarget(marker, fire.lat, fire.lng, `FIRMS ANOMALY ${fire.id}`, `STATUS: ${statusText}<br>FRP: ${fire.frp} MW`));
            
            this.firmsMarkers.push(marker);
        });

        // Clear resolved FIRMS alarms that are no longer active in the current NASA payload
        for (const targetId of this.state.activeAlarms.keys()) {
            if (targetId.startsWith('FIRMS-') && !incomingFirmsIds.has(targetId)) {
                this.state.activeAlarms.delete(targetId);
                const el = document.querySelector(`[data-target="${targetId}"]`);
                if (el) el.remove();
            }
        }
        this.evalPattersonLoop();

        // 1. Calculate Live AI Threat Matrix for Q2/Q3
        const p1Count = payload.fires.filter(f => f.status === 'CRITICAL').length;
        const p2Count = payload.fires.filter(f => f.status === 'WARNING').length;
        
        const isSimulated = payload.source === "SIMULATED_FALLBACK";
        const overallStatus = isSimulated ? "FPO [SIMULATED]" : (p1Count > 0 ? `ACTIVE [${p1Count} P1]` : (p2Count > 0 ? `ACTIVE [${p2Count} P2]` : `NORMAL`));
        const overallColor = isSimulated ? '#00A3DA' : (p1Count > 0 ? '#ba1a1a' : (p2Count > 0 ? '#F57C00' : '#333333'));

        // 2. Update Master Database
        this.SYSTEM_ROSTER['firms'].status = overallStatus;
        this.SYSTEM_ROSTER['firms'].color = overallColor;

        // 3. Update Q3 Telemetry Row
        const firmsRowSpan = document.querySelector('tr[data-sys="firms"] span');
        if (firmsRowSpan) {
            firmsRowSpan.innerText = overallStatus;
            firmsRowSpan.style.color = overallColor;
            // Ensure standard PV font formatting is applied dynamically
            firmsRowSpan.className = "font-mono text-[18px] font-bold";
        }

        // 4. Force Live Update of Q2 Card if operator is looking at it
        const sysIdActive = document.querySelector('.sys-submenu-btn.bg-\\[\\#37474F\\]');
        if (sysIdActive && sysIdActive.getAttribute('data-sys') === 'firms') {
            this.loadSystemDetail('firms');
        }

        // 4.5 Auto-frame the Q1 map to perfectly fit all incoming threat data
        if (this.firmsMarkers && this.firmsMarkers.length > 0) {
            const group = new L.featureGroup(this.firmsMarkers);
            this.map.fitBounds(group.getBounds(), { padding: [50, 50], maxZoom: 11 });
        }

        // 5. Inject Live Threat Matrix into Q2 Reports Tab
        const reportMount = document.getElementById('q2-reports-mount');
        if (reportMount && !isSimulated) {
            const time = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
            
            // Remove previous FIRMS report to avoid clutter on polling updates
            const existingReport = document.getElementById('report-firms-live');
            if (existingReport) existingReport.remove();

            const borderColor = p1Count > 0 ? 'border-[#ba1a1a]' : (p2Count > 0 ? 'border-[#F57C00]' : 'border-outline-variant');
            const titleColor = p1Count > 0 ? 'text-[#ba1a1a]' : (p2Count > 0 ? 'text-[#F57C00]' : 'text-[#333333]');
            
            // Grab the highest priority target for the quick-link focus
            const topThreat = payload.fires.find(f => f.status === 'CRITICAL') || payload.fires.find(f => f.status === 'WARNING') || payload.fires[0];
            
            const reportHtml = `
                <div id="report-firms-live" class="bg-[#E8E8E8] border ${borderColor} p-3 flex justify-between items-center hover:bg-[#E0E0E0] cursor-pointer transition-colors">
                    <div class="flex flex-col">
                        <span class="text-[12px] font-bold ${titleColor}">NASA FIRMS THREAT MATRIX</span>
                        <span class="text-[10px] font-bold text-[#777777] uppercase tracking-widest mt-1">${p1Count} CRITICAL, ${p2Count} WARNING ANOMALIES DETECTED</span>
                    </div>
                    <span class="font-mono text-[14px] font-bold text-[#555555]">${time}</span>
                </div>
            `;
            
            reportMount.insertAdjacentHTML('afterbegin', reportHtml);
            
            // Bind click event to focus the top threat in Q2 Detail View
            const newReportEl = document.getElementById('report-firms-live');
            if (newReportEl && topThreat) {
                newReportEl.addEventListener('click', () => {
                    this.focusTargetDetail(topThreat.lat, topThreat.lng, `FIRMS ANOMALY ${topThreat.id}`, `STATUS: ${topThreat.status}<br>FRP: ${topThreat.frp} MW<br>DIST: ${topThreat.distance.toFixed(1)} km`);
                });
            }
        }
        
        // 6. Update Map Overlay Button State
        this.renderMapControls();
        this.applyFirmsVisibility();
    },

    renderMapControls() {
        const mount = document.getElementById('q1-map-controls');
        if (!mount || typeof Galatea === 'undefined') return;

        // Generate dynamic SVG Flame and Button
        const flameSvg = Galatea.getFlameIcon('#000'); 
        mount.innerHTML = Galatea.createMapToggleBtn('toggle-firms', 'FIRMS LAYER', flameSvg, this.state.showFirms);

        // Bind Click Logic
        document.getElementById('toggle-firms').addEventListener('click', () => {
            this.state.showFirms = !this.state.showFirms;
            this.renderMapControls();
            this.applyFirmsVisibility();
        });
    },

    applyFirmsVisibility() {
        if (!this.state.showFirms) {
            // Master kill-switch: remove all from map
            if (this.map.hasLayer(this.layerCritical)) this.map.removeLayer(this.layerCritical);
            if (this.map.hasLayer(this.layerNormal)) this.map.removeLayer(this.layerNormal);
        } else {
            // Re-apply forcing all layers on to verify visual data
            if (!this.map.hasLayer(this.layerCritical)) this.map.addLayer(this.layerCritical);
            if (!this.map.hasLayer(this.layerNormal)) this.map.addLayer(this.layerNormal);
        }
    },

    selectMapTarget(markerRef, lat, lng, title, telemetryData) {
        // Clear all previous magenta map rings
        document.querySelectorAll('.leaflet-marker-icon, path.leaflet-interactive').forEach(el => {
            el.classList.remove('hphmi-map-selected');
        });
        
        // Apply Magenta to the clicked Leaflet DOM element
        if (markerRef && markerRef._icon) markerRef._icon.classList.add('hphmi-map-selected');
        if (markerRef && markerRef._path) markerRef._path.classList.add('hphmi-map-selected');

        // Pass payload to Q2 Detail Map (from our previous session)
        if (typeof this.focusTargetDetail === 'function') {
            this.focusTargetDetail(lat, lng, title, telemetryData);
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    EchoCore.init();
    // Auto-load LEO on boot so Q2 isn't empty
    EchoCore.loadSystemDetail('leo');
});