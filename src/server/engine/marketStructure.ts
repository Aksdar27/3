import { Candle } from '../../types.js';

export let m1Candles: Candle[] = [];
export let m5Candles: Candle[] = [];
export let m15Candles: Candle[] = [];
export let h1Candles: Candle[] = [];

let currentM1: Candle | null = null;
let currentM5: Candle | null = null;
let currentM15: Candle | null = null;
let currentH1: Candle | null = null;

export function updateCandles(price: number, timestamp: number = Date.now()) {
    const minMilli = 60 * 1000;
    
    // M1
    const m1Time = Math.floor(timestamp / minMilli) * minMilli;
    if (!currentM1 || currentM1.timestamp < m1Time) {
        if (currentM1) m1Candles.push(currentM1);
        if (m1Candles.length > 200) m1Candles.shift();
        currentM1 = { timestamp: m1Time, open: price, high: price, low: price, close: price, volume: 1 };
    } else {
        currentM1.high = Math.max(currentM1.high, price);
        currentM1.low = Math.min(currentM1.low, price);
        currentM1.close = price;
        currentM1.volume = (currentM1.volume || 1) + 1;
    }
    
    // M5
    const m5Time = Math.floor(timestamp / (5 * minMilli)) * (5 * minMilli);
    if (!currentM5 || currentM5.timestamp < m5Time) {
        if (currentM5) m5Candles.push(currentM5);
        if (m5Candles.length > 200) m5Candles.shift();
        currentM5 = { timestamp: m5Time, open: price, high: price, low: price, close: price, volume: 1 };
    } else {
        currentM5.high = Math.max(currentM5.high, price);
        currentM5.low = Math.min(currentM5.low, price);
        currentM5.close = price;
        currentM5.volume = (currentM5.volume || 1) + 1;
    }

    // M15
    const m15Time = Math.floor(timestamp / (15 * minMilli)) * (15 * minMilli);
    if (!currentM15 || currentM15.timestamp < m15Time) {
        if (currentM15) m15Candles.push(currentM15);
        if (m15Candles.length > 200) m15Candles.shift();
        currentM15 = { timestamp: m15Time, open: price, high: price, low: price, close: price, volume: 1 };
    } else {
        currentM15.high = Math.max(currentM15.high, price);
        currentM15.low = Math.min(currentM15.low, price);
        currentM15.close = price;
        currentM15.volume = (currentM15.volume || 1) + 1;
    }

    // H1
    const h1Time = Math.floor(timestamp / (60 * minMilli)) * (60 * minMilli);
    if (!currentH1 || currentH1.timestamp < h1Time) {
        if (currentH1) h1Candles.push(currentH1);
        if (h1Candles.length > 200) h1Candles.shift();
        currentH1 = { timestamp: h1Time, open: price, high: price, low: price, close: price, volume: 1 };
    } else {
        currentH1.high = Math.max(currentH1.high, price);
        currentH1.low = Math.min(currentH1.low, price);
        currentH1.close = price;
        currentH1.volume = (currentH1.volume || 1) + 1;
    }

}

export function detectH1Bias(): 'BULLISH' | 'BEARISH' | 'NEUTRAL' {
    if (h1Candles.length > 2) {
        const last = h1Candles[h1Candles.length - 1];
        const prev = h1Candles[h1Candles.length - 2];
        if (last.close > last.open && prev.close > prev.open && last.close > prev.close) {
             return 'BULLISH';
        } else if (last.close < last.open && prev.close < prev.open && last.close < prev.close) {
             return 'BEARISH';
        }
    }
    return 'NEUTRAL';
}

export function detectHTFTrend(): 'BULLISH' | 'BEARISH' | 'NEUTRAL' {
    if (m15Candles.length > 2) {
        const last = m15Candles[m15Candles.length - 1];
        const prev = m15Candles[m15Candles.length - 2];
        if (last.close > last.open && prev.close > prev.open && last.close > prev.close) {
             return 'BULLISH';
        } else if (last.close < last.open && prev.close < prev.open && last.close < prev.close) {
             return 'BEARISH';
        }
    }
    return 'NEUTRAL';
}

export function getPivots(candles: Candle[]) {
    let ph = null;
    let pl = null;
    let phWick = 0;
    let plWick = 0;
    let equalHighs = false;
    let equalLows = false;
    
    for (let i = candles.length - 3; i >= 2; i--) {
        if (!ph && candles[i].high > candles[i-1].high && candles[i].high > candles[i-2].high && candles[i].high > candles[i+1].high && candles[i].high > candles[i+2].high) {
            ph = candles[i].high;
            phWick = Math.abs(candles[i].high - Math.max(candles[i].open, candles[i].close));
            // Check for equal highs
            for (let j = i - 1; j >= Math.max(0, i - 10); j--) {
                if (Math.abs(candles[j].high - ph) < 0.2) equalHighs = true;
            }
        }
        if (!pl && candles[i].low < candles[i-1].low && candles[i].low < candles[i-2].low && candles[i].low < candles[i+1].low && candles[i].low < candles[i+2].low) {
            pl = candles[i].low;
            plWick = Math.abs(Math.min(candles[i].open, candles[i].close) - candles[i].low);
            // Check for equal lows
            for (let j = i - 1; j >= Math.max(0, i - 10); j--) {
                if (Math.abs(candles[j].low - pl) < 0.2) equalLows = true;
            }
        }
        if (ph && pl) break;
    }
    return { ph, pl, phWick, plWick, equalHighs, equalLows };
}

export function validateBOS(candle: Candle, level: number, dir: 'UP' | 'DOWN', atr: number): { valid: boolean, type: 'iCHOCH' | 'eBOS', score: number } {
    const bodyTop = Math.max(candle.open, candle.close);
    const bodyBottom = Math.min(candle.open, candle.close);
    const candleSize = Math.abs(candle.high - candle.low);
    const bodySize = Math.abs(candle.close - candle.open);
    
    // Reject BOS jika candle body kecil atau displacement lemah
    if (bodySize < candleSize * 0.5) return { valid: false, type: 'iCHOCH', score: 0 }; 
    if (bodySize < atr * 0.3) return { valid: false, type: 'iCHOCH', score: 0 }; // must have displacement length

    let score = 0;
    if (candleSize > atr * 0.6) score += 20; // High momentum displacement
    
    // Simplistic external vs internal check
    // If the displacement is huge, we count it as external BOS. 
    // Usually external BOS breaks an HTF structure, internal breaks LTF.
    const type = candleSize > atr ? 'eBOS' : 'iCHOCH';
    
    if (dir === 'UP') {
        const topWick = candle.high - bodyTop;
        // Reject jika wick dominan
        if (topWick > bodySize * 0.7) return { valid: false, type, score: 0 };
        if (bodyTop > level) {
            score += 30;
            return { valid: true, type, score };
        }
    } else {
        const bottomWick = bodyBottom - candle.low;
        // Reject jika wick dominan
        if (bottomWick > bodySize * 0.7) return { valid: false, type, score: 0 };
        if (bodyBottom < level) {
            score += 30;
            return { valid: true, type, score };
        }
    }
    return { valid: false, type: 'iCHOCH', score: 0 };
}

export function validateFVG(c1: Candle, c3: Candle, dir: 'UP' | 'DOWN', atr: number): { valid: boolean, fvgZone: {top: number, bottom: number} | null, score: number } {
    const minFvgSize = atr * 0.15;
    let score = 0;

    if (dir === 'DOWN' && c1.low > c3.high) {
        const gap = c1.low - c3.high;
        if (gap > minFvgSize) {
             if (gap > atr * 0.3) score += 20; // Impulsive FVG
             return { valid: true, fvgZone: { top: c1.low, bottom: c3.high }, score: 20 + score };
        }
    } else if (dir === 'UP' && c1.high < c3.low) {
        const gap = c3.low - c1.high;
        if (gap > minFvgSize) {
             if (gap > atr * 0.3) score += 20; // Impulsive FVG
             return { valid: true, fvgZone: { top: c3.low, bottom: c1.high }, score: 20 + score };
        }
    }
    return { valid: false, fvgZone: null, score: 0 };
}

export function isMarketRanging(atr: number, recentHigh: number, recentLow: number): boolean {
    if (atr < 2.0) return true; // ATR too small
    const range = recentHigh - recentLow;
    if (range < atr * 1.5) return true; // Market compression tighter than 1.5 ATR
    return false;
}
