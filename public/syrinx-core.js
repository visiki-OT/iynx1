/**
 * SYRINX//1 - The Audio Vault
 * Procedural Web Audio API soundscapes for High-Performance HMIs.
 * Zero external dependencies. Generates chords purely via mathematics.
 */

const Syrinx = {
    audioCtx: null,
    masterCompressor: null,

    init() {
        if (!this.audioCtx) {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            
            // Master Compressor (Prevents polyphonic clipping/distortion on chords)
            this.masterCompressor = this.audioCtx.createDynamicsCompressor();
            this.masterCompressor.threshold.value = -12;
            this.masterCompressor.knee.value = 10;
            this.masterCompressor.ratio.value = 12;
            this.masterCompressor.attack.value = 0.002;
            this.masterCompressor.release.value = 0.1;
            
            this.masterCompressor.connect(this.audioCtx.destination);
        }
        if (this.audioCtx.state === 'suspended') {
            this.audioCtx.resume();
        }
    },

    playAlarm(priority, isMuted = false) {
        if (isMuted) return;
        this.init(); // Auto-initialize on first play attempt
        
        const ctx = this.audioCtx;
        const now = ctx.currentTime;
        const comp = this.masterCompressor;

        if (priority === 1) { 
            const freqs = [400, 600, 800]; 
            const pulseDur = 0.15, pulseGap = 0.10, atk = 0.04, rel = 0.05;       
            for (let i = 0; i < 3; i++) {
                const startTime = now + (i * (pulseDur + pulseGap));
                freqs.forEach((freq, index) => {
                    const osc = ctx.createOscillator();
                    const gainNode = ctx.createGain();
                    osc.type = index % 2 === 0 ? 'sine' : 'triangle';
                    osc.frequency.value = freq;
                    gainNode.gain.setValueAtTime(0, startTime);
                    gainNode.gain.linearRampToValueAtTime(0.12, startTime + atk);
                    gainNode.gain.setValueAtTime(0.12, startTime + pulseDur - rel);
                    gainNode.gain.linearRampToValueAtTime(0, startTime + pulseDur);
                    osc.connect(gainNode);
                    gainNode.connect(comp);
                    osc.start(startTime);
                    osc.stop(startTime + pulseDur);
                });
            }
        } else if (priority === 2) { 
            const freqs = [500, 700]; 
            const pulseDur = 0.20, pulseGap = 0.15, atk = 0.04, rel = 0.05;       
            for (let i = 0; i < 2; i++) {
                const startTime = now + (i * (pulseDur + pulseGap));
                freqs.forEach((freq, index) => {
                    const osc = ctx.createOscillator();
                    const gainNode = ctx.createGain();
                    osc.type = index % 2 === 0 ? 'sine' : 'triangle';
                    osc.frequency.value = freq;
                    gainNode.gain.setValueAtTime(0, startTime);
                    gainNode.gain.linearRampToValueAtTime(0.10, startTime + atk);
                    gainNode.gain.setValueAtTime(0.10, startTime + pulseDur - rel);
                    gainNode.gain.linearRampToValueAtTime(0, startTime + pulseDur);
                    osc.connect(gainNode);
                    gainNode.connect(comp);
                    osc.start(startTime);
                    osc.stop(startTime + pulseDur);
                });
            }
        } else if (priority === 3) { 
            const freqs = [600, 750]; 
            const pulseDur = 0.25, atk = 0.05, rel = 0.10;       
            freqs.forEach((freq) => {
                const osc = ctx.createOscillator();
                const gainNode = ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.value = freq;
                gainNode.gain.setValueAtTime(0, now);
                gainNode.gain.linearRampToValueAtTime(0.08, now + atk);
                gainNode.gain.setValueAtTime(0.08, now + pulseDur - rel);
                gainNode.gain.linearRampToValueAtTime(0, now + pulseDur);
                osc.connect(gainNode);
                gainNode.connect(comp);
                osc.start(now);
                osc.stop(now + pulseDur);
            });
        } else if (priority === 4) { 
            const freqs = [800, 1000]; 
            const pulseDur = 0.15, atk = 0.02, rel = 0.05;       
            freqs.forEach((freq) => {
                const osc = ctx.createOscillator();
                const gainNode = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.value = freq;
                gainNode.gain.setValueAtTime(0, now);
                gainNode.gain.linearRampToValueAtTime(0.06, now + atk);
                gainNode.gain.setValueAtTime(0.06, now + pulseDur - rel);
                gainNode.gain.linearRampToValueAtTime(0, now + pulseDur);
                osc.connect(gainNode);
                gainNode.connect(comp);
                osc.start(now);
                osc.stop(now + pulseDur);
            });
        } else if (priority === 5) {
            const freq = 400; 
            const pulseDur = 0.10, atk = 0.02, rel = 0.05;       
            const osc = ctx.createOscillator();
            const gainNode = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = freq;
            gainNode.gain.setValueAtTime(0, now);
            gainNode.gain.linearRampToValueAtTime(0.04, now + atk); 
            gainNode.gain.setValueAtTime(0.04, now + pulseDur - rel);
            gainNode.gain.linearRampToValueAtTime(0, now + pulseDur);
            osc.connect(gainNode);
            gainNode.connect(comp);
            osc.start(now);
            osc.stop(now + pulseDur);
        }
    }
};