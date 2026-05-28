import { Candle } from '../../types.js';

export interface OrderBlock {
    top: number;
    bottom: number;
    type: 'BULLISH' | 'BEARISH';
    mitigated: boolean;
    mitigations: number;
    mitigationDepth: number; // 0 to 1 distance inside OB
    breaker: boolean; 
    timestamp: number;
    score: number;
    refinedTop: number;
    refinedBottom: number;
    isAnchoredToImbalance: boolean;
}

export let activeOBs: OrderBlock[] = [];

export function updateOrderBlocks(candles: Candle[], atr: number) {
    if (candles.length < 5) return;
    
    const latest = candles.length - 1;
    const c1 = candles[latest - 2];
    const c2 = candles[latest - 1]; 
    const c3 = candles[latest]; 
    
    const c1Vol = c1.volume || 1;
    const c2Vol = c2.volume || 1;
    const volExpansion = c2Vol > c1Vol * 1.5;
    
    // Bullish OB
    if (c1.close < c1.open && c2.close > c2.open) {
        const displacement = c2.close - c2.open;
        if (displacement > atr * 0.5 && volExpansion) {
             let obTop = Math.max(c1.open, c1.high);
             let obBottom = c1.low;
             
             // Anchor to Imbalance (FVG)
             let anchored = false;
             if (c1.high < c3.low) {
                 // FVG present between c1 and c3
                 anchored = true;
                 // Refine OB to only mapping the FVG inefficiency edge or the 50% equilibrium of the OB
                 const fvgBottom = c3.low;
                 if (fvgBottom < obTop) obTop = fvgBottom; // tighten top to the exact inefficiency line
             }

             if (obTop - obBottom > atr * 0.1) {
                 const eq = (obTop + obBottom) / 2; // 50% CE (Consequent Encroachment)
                 activeOBs.push({
                     top: obTop,
                     bottom: obBottom,
                     type: 'BULLISH',
                     mitigated: false,
                     mitigations: 0,
                     mitigationDepth: 0,
                     breaker: false,
                     timestamp: c1.timestamp,
                     score: anchored ? 95 : (displacement > atr ? 85 : 65),
                     refinedTop: obTop,
                     refinedBottom: eq, // Best entries happen at 50% mark
                     isAnchoredToImbalance: anchored
                 });
             }
        }
    }
    
    // Bearish OB
    if (c1.close > c1.open && c2.close < c2.open) {
        const displacement = c2.open - c2.close;
        if (displacement > atr * 0.5 && volExpansion) {
             let obTop = c1.high;
             let obBottom = Math.min(c1.open, c1.low);
             
             let anchored = false;
             if (c1.low > c3.high) {
                 // FVG present between c1 and c3
                 anchored = true;
                 const fvgTop = c3.high;
                 if (fvgTop > obBottom) obBottom = fvgTop; 
             }

             if (obTop - obBottom > atr * 0.1) {
                 const eq = (obTop + obBottom) / 2; 
                 activeOBs.push({
                     top: obTop,
                     bottom: obBottom,
                     type: 'BEARISH',
                     mitigated: false,
                     mitigations: 0,
                     mitigationDepth: 0,
                     breaker: false,
                     timestamp: c1.timestamp,
                     score: anchored ? 95 : (displacement > atr ? 85 : 65),
                     refinedTop: eq,
                     refinedBottom: obBottom,
                     isAnchoredToImbalance: anchored
                 });
             }
        }
    }
    
    // Check Mitigation & Breaker states
    const current = candles[latest];
    for (let ob of activeOBs) {
        if (ob.mitigated && !ob.breaker) continue;
        
        const ageHours = (Date.now() - ob.timestamp) / (1000 * 60 * 60);
        if (ageHours > 1) ob.score -= (ageHours * 5); 
        
        if (ob.type === 'BULLISH') {
            if (current.low <= ob.top && current.high >= ob.bottom) {
                ob.mitigations++;
                ob.mitigated = true; 
                const depth = (ob.top - current.low) / (ob.top - ob.bottom);
                ob.mitigationDepth = Math.max(ob.mitigationDepth, depth);
                // Mitigation Ranking: Perfect touch gets bonus, deep piercing loses score
                if (depth < 0.2) ob.score += 10;
                else if (depth > 0.8) ob.score -= 20;
            }
            if (current.close < ob.bottom - (atr * 0.1)) {
                ob.type = 'BEARISH';
                ob.breaker = true;
                ob.mitigated = false;
                ob.mitigations = 0;
                ob.score = ob.isAnchoredToImbalance ? 75 : 60; 
                const eq = (ob.top + ob.bottom)/2;
                ob.refinedTop = eq;
                ob.refinedBottom = ob.bottom;
            }
        } else {
            if (current.high >= ob.bottom && current.low <= ob.top) {
                ob.mitigations++;
                ob.mitigated = true;
                const depth = (current.high - ob.bottom) / (ob.top - ob.bottom);
                ob.mitigationDepth = Math.max(ob.mitigationDepth, depth);
                if (depth < 0.2) ob.score += 10;
                else if (depth > 0.8) ob.score -= 20;
            }
            if (current.close > ob.top + (atr * 0.1)) {
                ob.type = 'BULLISH';
                ob.breaker = true;
                ob.mitigated = false;
                ob.mitigations = 0;
                ob.score = ob.isAnchoredToImbalance ? 75 : 60; 
                const eq = (ob.top + ob.bottom)/2;
                ob.refinedTop = ob.top;
                ob.refinedBottom = eq;
            }
        }
    }
    
    // Prune 
    activeOBs = activeOBs.filter(ob => ob.score > 0 && (Date.now() - ob.timestamp < 4 * 3600000) && ob.mitigations < 3);
}
