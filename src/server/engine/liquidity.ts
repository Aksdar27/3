import { Candle } from '../../types.js';

export interface LiquidityPool {
    level: number;
    type: 'HIGH' | 'LOW';
    strength: number; 
    age: number;
    touches: number;
    swept: boolean;
    engineered: boolean; 
    magneticScore: number;
    expired: boolean;
}

function getSwingPivots(candles: Candle[], leftBars: number = 3, rightBars: number = 3) {
    let pivotHighs: {level: number, index: number}[] = [];
    let pivotLows: {level: number, index: number}[] = [];
    
    for (let i = leftBars; i < candles.length - rightBars; i++) {
        let isHigh = true;
        let isLow = true;
        const current = candles[i];
        
        for (let j = i - leftBars; j <= i + rightBars; j++) {
            if (i === j) continue;
            if (candles[j].high >= current.high) isHigh = false;
            if (candles[j].low <= current.low) isLow = false;
        }
        
        if (isHigh) pivotHighs.push({level: current.high, index: i});
        if (isLow) pivotLows.push({level: current.low, index: i});
    }
    
    return { pivotHighs, pivotLows };
}

function groupPivots(pivots: {level: number, index: number}[], threshold: number) {
    let clusters: {level: number, index: number}[][] = [];
    let used = new Set<number>();
    
    for (let i = 0; i < pivots.length; i++) {
        if (used.has(i)) continue;
        let cluster = [pivots[i]];
        used.add(i);
        
        for (let j = i + 1; j < pivots.length; j++) {
            if (!used.has(j) && Math.abs(pivots[i].level - pivots[j].level) <= threshold) {
                cluster.push(pivots[j]);
                used.add(j);
            }
        }
        clusters.push(cluster);
    }
    return clusters;
}

export function detectLiquidityPools(candles: Candle[], atr: number, currentPrice: number): LiquidityPool[] {
    const pools: LiquidityPool[] = [];
    if (candles.length < 10) return pools;
    
    const { pivotHighs, pivotLows } = getSwingPivots(candles, 4, 2);
    
    let bslClusters = groupPivots(pivotHighs, atr * 0.15);
    let sslClusters = groupPivots(pivotLows, atr * 0.15);
    
    const maxAge = 100; // Candlestick age threshold for expiration

    for (const cluster of bslClusters) {
        const age = (candles.length - 1) - cluster[0].index;
        const expired = age > maxAge;
        const touches = cluster.length;
        const level = Math.max(...cluster.map(c => c.level));
        const distance = Math.abs(currentPrice - level);

        // Magnetic Score formula: (Touches * 50) / (Distance in ATRs) - Age decay
        const magneticScore = expired ? 0 : Math.max(0, ((touches * 50) / Math.max(0.5, distance / atr)) - (age * 0.5));

        pools.push({
            level, 
            type: 'HIGH',
            strength: cluster.length * 2,
            age,
            touches,
            swept: false,
            engineered: cluster.length >= 2,
            magneticScore,
            expired
        });
    }
    
    for (const cluster of sslClusters) {
        const age = (candles.length - 1) - cluster[0].index;
        const expired = age > maxAge;
        const touches = cluster.length;
        const level = Math.min(...cluster.map(c => c.level));
        const distance = Math.abs(currentPrice - level);

        const magneticScore = expired ? 0 : Math.max(0, ((touches * 50) / Math.max(0.5, distance / atr)) - (age * 0.5));

        pools.push({
            level, 
            type: 'LOW',
            strength: cluster.length * 2,
            age,
            touches,
            swept: false,
            engineered: cluster.length >= 2,
            magneticScore,
            expired
        });
    }
    
    return pools.filter(p => !p.expired).sort((a,b) => b.magneticScore - a.magneticScore);
}
