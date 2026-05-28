import { Candle } from '../../types.js';
import { LiquidityPool } from './liquidity.js';

export function detectSweep(m1Candles: Candle[], pools: LiquidityPool[], atr: number): { swept: boolean, pool: LiquidityPool | null, score: number } {
    if (m1Candles.length < 5) return { swept: false, pool: null, score: 0 };
    
    const latest = m1Candles[m1Candles.length - 1];
    const prev = m1Candles[m1Candles.length - 2];
    const prev2 = m1Candles[m1Candles.length - 3];
    
    for (const pool of pools) {
        if (!pool.swept) {
            // Sweep of BSL (Buy-side liquidity)
            if (pool.type === 'HIGH') {
                // Was liquidity consumed? 
                const tookLiquidity = latest.high > pool.level || prev.high > pool.level || prev2.high > pool.level;
                if (tookLiquidity) {
                   // Rejection Validation
                   if (latest.close < pool.level && latest.close < latest.open) {
                       const wickSize = latest.high - Math.max(latest.open, latest.close);
                       const bodySize = latest.open - latest.close;
                       
                       // Reject passive sweeps (body slowly closed above level, we need fast rejection)
                       if (prev.close > pool.level + (atr * 0.3)) continue; 
                       
                       // Displacement requirement for the rejection
                       if (bodySize < atr * 0.2) continue; // Weak rejection
                       
                       // Score the sweep
                       let sweepScore = 50;
                       if (wickSize > bodySize) sweepScore += 20; // strong exhaustion wick
                       if (latest.close < prev.low) sweepScore += 30; // engulfing rejection
                       if (pool.engineered) sweepScore += 20;
                       if (pool.touches >= 2) sweepScore += 10;
                       if (pool.age > 60) sweepScore += 10; // Older liquor holds more weight
                       
                       pool.swept = true;
                       return { swept: true, pool, score: Math.min(100, sweepScore) };
                   }
                }
            }
            // Sweep of SSL (Sell-side liquidity)
            if (pool.type === 'LOW') {
                 // Was liquidity consumed?
                 const tookLiquidity = latest.low < pool.level || prev.low < pool.level || prev2.low < pool.level;
                 if (tookLiquidity) {
                    // Rejection Validation
                    if (latest.close > pool.level && latest.close > latest.open) {
                        const wickSize = Math.min(latest.open, latest.close) - latest.low;
                        const bodySize = latest.close - latest.open;
                        
                        if (prev.close < pool.level - (atr * 0.3)) continue; 
                        
                        if (bodySize < atr * 0.2) continue; // Weak rejection
                        
                        // Score the sweep
                        let sweepScore = 50;
                        if (wickSize > bodySize) sweepScore += 20;
                        if (latest.close > prev.high) sweepScore += 30; 
                        if (pool.engineered) sweepScore += 20;
                        if (pool.touches >= 2) sweepScore += 10;
                        if (pool.age > 60) sweepScore += 10;
                        
                        pool.swept = true;
                        return { swept: true, pool, score: Math.min(100, sweepScore) };
                    }
                 }
            }
        }
    }
    return { swept: false, pool: null, score: 0 };
}
