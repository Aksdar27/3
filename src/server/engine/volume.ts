import { Candle } from '../../types.js';

export interface VolumeMetrics {
    valid: boolean;
    volExpansion: boolean;
    isAbnormal: boolean;
    lowParticipation: boolean;
    effortVsResult: boolean;
    score: number;
    tickDensity: number;
    participationIntensity: number;
}

// Tick cache for synthetic participation
const tickTimestamps: number[] = [];

export function registerTick(timestamp: number = Date.now()) {
    tickTimestamps.push(timestamp);
    // Keep last 5 minutes of ticks safely
    if (tickTimestamps.length > 3000) {
        tickTimestamps.splice(0, tickTimestamps.length - 2000); 
    }
}

export function analyzeVolumeParticipant(candles: Candle[], atr: number, timestamp: number = Date.now()): VolumeMetrics {
    if (candles.length < 5) {
        return { valid: true, volExpansion: false, isAbnormal: false, lowParticipation: false, effortVsResult: false, score: 50, tickDensity: 1, participationIntensity: 1 };
    }

    // Measure Tick Density over last 60 seconds
    const cutoff1m = timestamp - 60000;
    const ticks1m = tickTimestamps.filter(t => t >= cutoff1m).length;
    
    // Measure Tick Density over last 5 minutes to baseline
    const cutoff5m = timestamp - 300000;
    const ticks5m = tickTimestamps.filter(t => t >= cutoff5m && t < cutoff1m).length;
    const avgTicksPerMin = ticks5m / 4 || 1; // avg of the 4 prior minutes
    
    const tickDensity = ticks1m / avgTicksPerMin; // Ratio, > 1 implies acceleration
    
    // Calculate synthetic participation intensity based on range vs density
    const latest = candles[candles.length - 1];
    const prev = candles[candles.length - 2];
    
    const latestRange = latest.high - latest.low;
    // Intensity = Price displacement per tick
    const participationIntensity = ticks1m > 0 ? (latestRange / atr) * (ticks1m / 100) : 0; 
    
    let sumSyntheticVol = 0;
    let count = 0;
    for (let i = Math.max(0, candles.length - 24); i < candles.length - 2; i++) {
        sumSyntheticVol += (candles[i].volume || 1);
        count++;
    }
    const avgVol = count > 0 ? (sumSyntheticVol / count) : 1;
    
    const currentVol = latest.volume || 1;
    const prevVol = prev.volume || 1;
    
    // Combining explicit volume (if any provided by API) with our synthetic density model
    const volExpansion = (currentVol > avgVol * 1.5) || tickDensity > 1.8;
    const isAbnormal = currentVol > avgVol * 5 || tickDensity > 5.0; // Flash crash metric
    const lowParticipation = (currentVol < avgVol * 0.4) && (tickDensity < 0.4);
    
    let score = 50;
    
    if (volExpansion) score += 30;
    if (participationIntensity > 0.5) score += 15;
    if (tickDensity > 1.2 && !isAbnormal) score += 20;
    
    // Effort vs Result (VSA concept mapped to ticks)
    const latestBody = Math.abs(latest.close - latest.open);
    // High effort (density > 2x) but small result (body < 20% of ATR) -> Absorption
    const effortVsResult = (tickDensity > 2.0) && (latestBody < atr * 0.2); 
    
    if (effortVsResult) score -= 30; 
    if (isAbnormal) score -= 20; 
    if (lowParticipation) score -= 50; 
    
    return {
        valid: !lowParticipation && !isAbnormal,
        volExpansion,
        isAbnormal,
        lowParticipation,
        effortVsResult,
        score: Math.max(0, Math.min(100, score)),
        tickDensity,
        participationIntensity
    };
}
