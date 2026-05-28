import { globalState, addLog } from '../state.js';

export interface TradeScoreParams {
    bosScore: number;       
    fvgScore: number;       
    obScore?: number;
    volumeScore?: number;
    aiConfidence: number;   
    htfAligned: boolean;
    equalLiquiditySwept: boolean;
    atrValid: boolean;
    sessionValid: boolean;
}

export function evaluateTradeScore(params: TradeScoreParams, mode: 'AGGRESSIVE' | 'CONSERVATIVE'): { valid: boolean, totalScore: number } {
    let score = 0;
    
    // Weighted scoring:
    // HTF alignment = 20%
    // Liquidity sweep = 20%
    // BOS quality = 15%
    // FVG or OB quality = 15%
    // Volume Confirmation = 10%
    // Session = 10%
    // Volatility = 10%
    
    if (params.htfAligned) score += 20;
    if (params.equalLiquiditySwept) score += 20;

    const bosNorm = Math.min(params.bosScore, 100) / 100;
    score += bosNorm * 15;
    
    // Choose best of FVG or OB
    const structuralQuality = Math.max(params.fvgScore || 0, params.obScore || 0);
    const structNorm = Math.min(structuralQuality, 100) / 100;
    score += structNorm * 15;
    
    // Volume
    const volScore = params.volumeScore || 50; 
    score += (volScore / 100) * 10;
    
    if (params.sessionValid) score += 10;
    if (params.atrValid) score += 10;
    
    // AI Validator Limitation
    // AI only adds/subtracts max 5 points (marginal influence)
    const aiImpact = (params.aiConfidence - 50) * 0.1; 
    score += aiImpact;
    addLog(`AI Sentiment Impact: ${aiImpact > 0 ? '+' : ''}${aiImpact.toFixed(1)} points`);
    
    // Max Score is 100
    score = Math.max(0, Math.min(score, 100));

    // Thresholds
    const threshold = mode === 'CONSERVATIVE' ? 80 : 65;
    
    const valid = score >= threshold;
    
    if (valid) {
        addLog(`Trade Score Passed: ${score.toFixed(1)} / ${threshold} points`, 'info');
    } else {
        addLog(`Trade Score Rejected: Output = ${score.toFixed(1)}, Required = ${threshold}`, 'warn');
    }
    
    return { valid, totalScore: score };
}
