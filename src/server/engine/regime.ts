import { m15Candles, m5Candles, m1Candles } from './marketStructure.js';
import { currentWilderAtr } from './volatility.js';
import { analyzeVolumeParticipant } from './volume.js';

export type MarketRegime = 'TRENDING' | 'RANGING' | 'EXPANDING_VOLATILITY' | 'REVERSAL' | 'NEWS_VOLATILITY' | 'LOW_LIQUIDITY';

let currentRegime: MarketRegime = 'RANGING';
let regimeConfidence: number = 0;

export function detectMarketRegime(price: number): MarketRegime {
    if (m15Candles.length < 20 || m1Candles.length < 20) {
        currentRegime = 'RANGING';
        regimeConfidence = 50;
        return currentRegime;
    }

    const atr = currentWilderAtr;
    const m1Length = m1Candles.length;
    
    // Check News/Insane Volatility (Extreme jumps in short time)
    const recentM1Range = Math.max(...m1Candles.slice(-5).map(c => c.high)) - Math.min(...m1Candles.slice(-5).map(c => c.low));
    if (recentM1Range > atr * 3) {
        currentRegime = 'NEWS_VOLATILITY';
        regimeConfidence = 95;
        return currentRegime;
    }

    // Check Expanding Volatility (ATR rising fast)
    // Compare current ATR to SMA of last 10 ATRs if we tracked them, 
    // approximated here by checking recent wide candles.
    let wideCandles = 0;
    for (let i = m5Candles.length - 1; i >= Math.max(0, m5Candles.length - 5); i--) {
         const range = m5Candles[i].high - m5Candles[i].low;
         if (range > atr * 1.5) wideCandles++;
    }
    if (wideCandles >= 3) {
        currentRegime = 'EXPANDING_VOLATILITY';
        regimeConfidence = 80;
        return currentRegime;
    }

    // Check Low Liquidity
    const volMetrics = analyzeVolumeParticipant(m1Candles, atr);
    if (volMetrics.lowParticipation && recentM1Range < atr * 0.5) {
        currentRegime = 'LOW_LIQUIDITY';
        regimeConfidence = 85;
        return currentRegime;
    }

    // Check Trending vs Ranging vs Reversal
    let bullishM15 = 0;
    let bearishM15 = 0;
    let cumulativeCloseM15 = 0;
    const lookback = Math.min(20, m15Candles.length);
    
    for (let i = m15Candles.length - 1; i >= m15Candles.length - lookback; i--) {
        const c = m15Candles[i];
        if (c.close > c.open) bullishM15++;
        else if (c.close < c.open) bearishM15++;
        cumulativeCloseM15 += c.close - c.open;
    }

    const netDisplacement = Math.abs(m15Candles[m15Candles.length-1].close - m15Candles[m15Candles.length-lookback].open);
    
    if (netDisplacement < atr * 2) {
        currentRegime = 'RANGING';
        regimeConfidence = 70;
    } else {
        // Trending
        currentRegime = 'TRENDING';
        regimeConfidence = 80;
        
        // Reversal check - M1 is moving violently against M15 Trend
        const m15TrendDir = cumulativeCloseM15 > 0 ? 1 : -1;
        const m5TrendDir = m5Candles[m5Candles.length-1].close - m5Candles[Math.max(0, m5Candles.length-5)].open;
        
        if ((m15TrendDir > 0 && m5TrendDir < -atr * 1.5) || (m15TrendDir < 0 && m5TrendDir > atr * 1.5)) {
            currentRegime = 'REVERSAL';
            regimeConfidence = 75;
        }
    }

    return currentRegime;
}

export function getCurrentRegime() {
    return { regime: currentRegime, confidence: regimeConfidence };
}
