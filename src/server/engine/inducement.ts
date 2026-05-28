import { Candle } from '../../types.js';

export function checkInducement(candles: Candle[], atr: number, direction: 'BUY' | 'SELL'): boolean {
    if (candles.length < 5) return false;
    
    // Inducement is an early high/low that tricks traders into entering early before the real POI is tapped.
    // For BUY: price makes small lower low, then goes up slightly, then sweeps below that low again.
    // We basically check if there was a minor swing point before our entry zone.
    
    // Simplistic trap logic for demonstration
    const recent = candles.slice(-5);
    const last = recent[4];
    
    if (direction === 'BUY') {
        const trapLow = Math.min(recent[1].low, recent[2].low, recent[3].low);
        if (last.low < trapLow && last.close > trapLow) {
            return true; // We grabbed the inducement
        }
    } else {
        const trapHigh = Math.max(recent[1].high, recent[2].high, recent[3].high);
        if (last.high > trapHigh && last.close < trapHigh) {
            return true;
        }
    }
    
    return false;
}
