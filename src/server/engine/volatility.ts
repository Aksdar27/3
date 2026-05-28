import { Candle } from '../../types.js';

export let currentWilderAtr = 3.5;

export function updateWilderATR(candles15m: Candle[]): number {
    if (candles15m.length < 2) return currentWilderAtr;
    
    let period = 14;
    if (candles15m.length <= period) {
        // Simple Average if not enough data
        let trSum = 0;
        for (let i = 1; i < candles15m.length; i++) {
            const current = candles15m[i];
            const prev = candles15m[i - 1];
            const hl = current.high - current.low;
            const hc = Math.abs(current.high - prev.close);
            const lc = Math.abs(current.low - prev.close);
            trSum += Math.max(hl, hc, lc);
        }
        currentWilderAtr = trSum / (candles15m.length - 1);
        return currentWilderAtr;
    }
    
    // Wilder's Smoothing Method
    const current = candles15m[candles15m.length - 1];
    const prev = candles15m[candles15m.length - 2];
    
    const hl = current.high - current.low;
    const hc = Math.abs(current.high - prev.close);
    const lc = Math.abs(current.low - prev.close);
    
    const trueRange = Math.max(hl, hc, lc);
    currentWilderAtr = ((currentWilderAtr * (period - 1)) + trueRange) / period;
    
    return currentWilderAtr;
}

export function isVolatilityValid(atr: number): boolean {
    // Avoid trading during massive news spikes (ATR > 15) or extreme dead chop (ATR < 2.0)
    if (atr < 2.0) return false;
    if (atr > 15.0) return false;
    
    return true;
}
