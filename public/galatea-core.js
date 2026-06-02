/**
 * GALATEA//1 - The HMI Visual Library
 * Generates programmable SVG objects, pumps, valves, and dynamic Rate-of-Change bars.
 */

const Galatea = {
    // ==========================================
    // 1. VISUAL CONFIGURATION
    // ==========================================
    colors: {
        active: "#555555",       // Echo1 Standard Active
        white: "#FFFFFF",        // Echo1 Standard White
        bg: "#F1F1F1",           // Echo1 Surface Background
        stroke: "#555555",       // Echo1 Standard Stroke
        secondary: "#A0A0A0",    // Echo1 Secondary Line
        simulated: "#00A3DA",    // Echo1 iMac Blue (For FPO / Mocked Data)
        invalid: "#FF00FF"       // Echo1 Magenta (For Null / Offline Data)
    },
    
    weights: {
        stroke: 4,               
        mainLine: 3,             
        secondaryLine: 2         
    },

    // ==========================================
    // 2. SVG GENERATOR UTILITIES
    // ==========================================
    getPatternDef: function(patternId) {
        return `
            <defs>
                <pattern id="${patternId}" patternUnits="userSpaceOnUse" width="12" height="12">
                    <rect width="12" height="12" fill="${this.colors.white}" />
                    <circle cx="6" cy="6" r="3.5" fill="${this.colors.active}" />
                    <circle cx="0" cy="0" r="3.5" fill="${this.colors.active}" />
                    <circle cx="12" cy="0" r="3.5" fill="${this.colors.active}" />
                    <circle cx="0" cy="12" r="3.5" fill="${this.colors.active}" />
                    <circle cx="12" cy="12" r="3.5" fill="${this.colors.active}" />
                </pattern>
            </defs>
        `;
    },

    _generateAsset: function(dim, fillDef, fillRef, geometrySVG) {
        return `
            <svg height="${dim}" viewBox="0 0 100 100" width="${dim}" xmlns="http://www.w3.org/2000/svg" class="inline-block">
                ${fillDef}
                <g stroke="${this.colors.stroke}" stroke-width="${this.weights.stroke * 2}" stroke-linejoin="round" fill="${this.colors.stroke}">
                    ${geometrySVG}
                </g>
                <g fill="${fillRef}" stroke="none">
                    ${geometrySVG}
                </g>
            </svg>
        `;
    },

    // ==========================================
    // 3. INDUSTRIAL COMPONENTS
    // ==========================================
    getPump: function(state, size = 'L3') {
        const dim = size === 'L3' ? "56" : "26";
        let fillRef = "";
        let fillDef = "";
        
        if (state === "RUNNING") {
            fillRef = this.colors.active; 
        } else if (state === "STOPPED") {
            fillRef = this.colors.white; 
        } else if (state === "TRANSITION") {
            const patId = "pat-ht-" + Math.random().toString(36).substr(2, 9);
            fillDef = this.getPatternDef(patId);
            fillRef = `url(#${patId})`;
        } else {
            fillRef = this.colors.white;
        }

        const geometry = `
            <polygon points="40,60 15,95 65,95"></polygon>
            <rect x="40" y="35" width="45" height="15"></rect>
            <circle cx="40" cy="60" r="25"></circle>
        `;
        return this._generateAsset(dim, fillDef, fillRef, geometry);
    },

    getGateValve: function(state, size = 'L3') {
        const dim = size === 'L3' ? "56" : "26";
        let fillRef = "";
        let fillDef = "";

        if (state === "OPEN") {
            fillRef = this.colors.active;
        } else if (state === "CLOSED") {
            fillRef = this.colors.white;
        } else if (state === "TRANSITION") {
            const patId = "pat-ht-" + Math.random().toString(36).substr(2, 9);
            fillDef = this.getPatternDef(patId);
            fillRef = `url(#${patId})`;
        } else {
            fillRef = this.colors.white;
        }

        const geometry = `
            <polygon points="10,25 50,50 10,75"></polygon>
            <polygon points="90,25 50,50 90,75"></polygon>
        `;
        return this._generateAsset(dim, fillDef, fillRef, geometry);
    },

    getTank: function(fillPercent, size = 'L3') {
        const dim = size === 'L3' ? "56" : "26";
        const strokeW = this.weights.stroke;
        const fillH = 80 * (fillPercent / 100);
        const fillY = 90 - fillH; 
        
        const geometry = `
            <rect x="10" y="10" width="80" height="80" fill="${this.colors.white}" stroke="${this.colors.stroke}" stroke-width="${strokeW}"></rect>
            <rect x="10" y="${fillY}" width="80" height="${fillH}" fill="${this.colors.active}"></rect>
        `;
        return `<svg height="${dim}" viewBox="0 0 100 100" width="${dim}" xmlns="http://www.w3.org/2000/svg" class="inline-block">${geometry}</svg>`;
    },

    // ==========================================
    // 4. HPHMI ALARM SYMBOLOGY (MAP ICONS & Q4)
    // ==========================================
    getHphmiIcon: function(priority) {
        let svgHtml = '';
        if (priority === 1) { // P1: Red Triangle Down
            svgHtml = '<svg width="16" height="16" viewBox="0 0 16 16"><polygon points="8,16 0,0 16,0" fill="#ba1a1a"/></svg>';
            return { html: svgHtml, size: [16, 16], textIcon: '▼', colorClass: 'text-[#ba1a1a]' };
        } else if (priority === 2) { // P2: Orange Square
            svgHtml = '<svg width="14" height="14"><rect width="14" height="14" fill="#F57C00"/></svg>';
            return { html: svgHtml, size: [14, 14], textIcon: '■', colorClass: 'text-[#F57C00]' };
        } else if (priority === 3) { // P3: Blue Circle
            svgHtml = '<svg width="12" height="12"><circle cx="6" cy="6" r="6" fill="#1976D2"/></svg>';
            return { html: svgHtml, size: [12, 12], textIcon: '●', colorClass: 'text-[#1976D2]' };
        } else if (priority === 4) { // P4: Grey Asterisk (Alert Status)
            svgHtml = '<svg width="14" height="14" viewBox="0 0 14 14"><text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" font-family="Roboto Mono" font-weight="bold" font-size="14" fill="#555555" dy="2">*</text></svg>';
            return { html: svgHtml, size: [14, 14], textIcon: '*', colorClass: 'text-[#555555]' };
        } else { // P5 / Normal: Grey Info Circle
            svgHtml = '<svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="6" fill="none" stroke="#777777" stroke-width="2"/><text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" font-family="Inter" font-weight="bold" font-size="8" fill="#777777">i</text></svg>';
            return { html: svgHtml, size: [14, 14], textIcon: 'ⓘ', colorClass: 'text-[#777777]' };
        }
    },

    // ==========================================
    // 5. RATE OF CHANGE (DYNAMIC BARS)
    // ==========================================
    createCenterZeroBar(id, percentage) {
        const safeVal = Math.max(-100, Math.min(100, percentage));
        const isPositive = safeVal >= 0;
        const width = Math.abs(safeVal) / 2;
        const leftPos = isPositive ? 50 : 50 - width;

        return `
        <div class="flex items-center gap-2 justify-between my-2 bg-[#E8E8E8] p-2 border border-outline-variant rounded-none">
            <span class="text-[12px] text-[#777777] font-bold uppercase tracking-widest font-body">${id}</span>
            <div class="flex items-center gap-3">
                <div style="width: 40px; min-width: 40px; height: 12px; background-color: #e5e5e5; position: relative; overflow: hidden; border: 1px solid #d0d0d0;">
                    <div style="position: absolute; left: 50%; top: 0; bottom: 0; width: 1px; background-color: #000; transform: translateX(-50%); z-index: 10;"></div>
                    <div id="${id}-fill" style="position: absolute; left: ${leftPos}%; width: ${width}%; top: 0; bottom: 0; background-color: #555555; z-index: 5; transition: all 0.3s ease-out;"></div>
                </div>
                <span id="${id}-val" class="q3-val" style="font-family: 'Roboto Mono', monospace; font-size: 18px; font-weight: 700; color: #111111; width: 45px; text-align: right;">${safeVal}</span>
            </div>
        </div>
        `;
    },

    updateCenterZeroBar(id, newPercentage) {
        const fill = document.getElementById(`${id}-fill`);
        const text = document.getElementById(`${id}-val`);
        if (fill && text) {
            const safeVal = Math.max(-100, Math.min(100, newPercentage));
            const isPositive = safeVal >= 0;
            const width = Math.abs(safeVal) / 2;
            const leftPos = isPositive ? 50 : 50 - width;

            fill.style.width = `${width}%`;
            fill.style.left = `${leftPos}%`;
            text.innerText = safeVal;
        }
    },

    // ==========================================
    // 6. MASTER-DETAIL UI GENERATORS
    // ==========================================
    
    // Generates the row of submenu selector buttons (Echo1 Trends style)
    createSubmenuBtn(id, label, isActive) {
        // ALARM COLOR CONSTRAINT: Using industrial grays for non-alarm selection states
        const activeClass = "bg-[#37474F] text-white border-[#333333]";
        const inactiveClass = "bg-[#E0E0E0] text-[#333333] border-[#777777] hover:bg-[#D0D0D0]";
        const style = isActive ? activeClass : inactiveClass;
        
        return `<button class="px-3 py-1 border font-heading text-[10px] font-bold uppercase tracking-widest transition-colors rounded-sm sys-submenu-btn" data-sys="${id}">${label}</button>`;
    },

    // Generates the standardized Level 3 Telemetry Block
    createSystemDetailCard(sysData) {
        return `
            <div class="flex flex-col gap-4 animate-[fadeIn_0.2s_ease-out]">
                <div class="flex justify-between items-center bg-[#E8E8E8] p-4 border border-outline-variant">
                    <div class="flex flex-col gap-1">
                        <span class="text-[12px] font-bold uppercase tracking-widest text-[#777777]">HARDWARE TARGET</span>
                        <span class="text-[14px] font-bold text-[#333333]">${sysData.hw}</span>
                    </div>
                    <div class="flex flex-col gap-1 text-right">
                        <span class="text-[12px] font-bold uppercase tracking-widest text-[#777777]">LOCAL AI / LOGIC</span>
                        <span class="font-mono text-[18px] font-bold" style="color: ${sysData.color};">${sysData.status}</span>
                    </div>
                </div>

                <div class="flex flex-col gap-2 mt-4">
                    <span class="text-[12px] font-bold uppercase tracking-widest text-[#555555] border-b border-outline-variant pb-1">SUBSYSTEM CONTROLS</span>
                    <div class="p-4 bg-[#E0E0E0] border border-outline flex justify-between items-center hover:bg-[#D0D0D0] transition-colors">
                        <span class="text-[12px] font-bold uppercase tracking-widest text-[#333333]">SHOW ON Q3 ROSTER</span>
                        <input type="checkbox" class="sys-visibility-toggle cursor-pointer w-4 h-4 accent-[#555555]" data-sys="${sysData.id}" ${sysData.visible !== false ? 'checked' : ''}>
                    </div>
                </div>
            </div>
        `;
    },

    // ==========================================
    // 7. HPHMI MAP CONTROLS & ICONS
    // ==========================================
    getFlameIcon(color) {
        return `<svg width="14" height="14" viewBox="0 0 24 24" fill="${color}"><path d="M12 2C12 2 5 10 5 16C5 19.866 8.134 23 12 23C15.866 23 19 19.866 19 16C19 10 12 2 12 2ZM12 19C10.343 19 9 17.657 9 16C9 14.343 12 11 12 11C12 11 15 14.343 15 16C15 17.657 13.657 19 12 19Z"/></svg>`;
    },

    createMapToggleBtn(id, label, iconSvg, isActive) {
        // HPHMI Map Toggles: Dark Grey ON, Light Grey OFF. Not too bright against the map.
        const bg = isActive ? 'bg-[#888888]' : 'bg-[#E0E0E0]';
        const textCol = isActive ? 'text-white' : 'text-[#777777]';
        const fillCol = isActive ? '#FFFFFF' : '#777777';
        const shadow = isActive ? 'shadow-inner' : 'shadow-sm';
        
        // Inject color into the SVG if it uses our template
        const coloredSvg = iconSvg.replace(/fill="[^"]*"/, `fill="${fillCol}"`);

        return `
            <button id="${id}" class="pointer-events-auto flex items-center gap-2 px-3 py-1.5 ${bg} ${textCol} ${shadow} border border-outline transition-colors rounded-sm cursor-pointer hover:brightness-110">
                <div class="flex items-center justify-center w-[14px] h-[14px] shrink-0">${coloredSvg}</div>
                <span class="font-heading text-[10px] font-bold uppercase tracking-widest">${label}</span>
            </button>
        `;
    },

    getAudioIcon(isMuted) {
        if (isMuted) {
            // HPHMI Muted (Crossed out speaker)
            return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>`;
        } else {
            // HPHMI Active (Speaker emitting waves)
            return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>`;
        }
    }
};