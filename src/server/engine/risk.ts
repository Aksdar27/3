import { globalState, addLog } from '../state.js';
import { RiskStats } from '../../types.js';
import { getCurrentRegime } from './regime.js';

export const riskConfig = {
    maxDailyLoss: 5,
    maxConsecutiveLosses: 3,
    baseCooldownMs: 15 * 60 * 1000, 
    maxTradesPerSession: 8,
    minRR: 1.5,
    maxSpread: 0.3 
};

export function getAdaptiveRiskProfile(atr: number) {
    const stats = globalState.riskStats;
    const { regime, confidence } = getCurrentRegime();

    let riskPercent = 1.0; // Base 1%
    let rrRequirement = riskConfig.minRR;

    // Adjust based on DD
    if (stats && stats.consecutiveLosses >= 2) {
        riskPercent *= 0.5; // Halve risk after 2 losses
        rrRequirement = 2.0; // Demands better setups to recover
    }

    // Adjust based on Regime
    if (regime === 'TRENDING') {
        riskPercent *= 1.2; // Increase risk during strong trends
        rrRequirement = 1.5;
    } else if (regime === 'RANGING') {
        riskPercent *= 0.8;
        rrRequirement = 1.2; // Scalp tighter during ranges
    } else if (regime === 'EXPANDING_VOLATILITY') {
        riskPercent *= 0.5; // Size down in volatile markets (SL will be wider anyway)
        rrRequirement = 2.5; 
    } else if (regime === 'NEWS_VOLATILITY' || regime === 'LOW_LIQUIDITY') {
        riskPercent = 0; // Blackout
    }

    // Return the adaptive settings
    return {
        riskPercent,
        rrRequirement,
        regime
    };
}

export function updateRiskStats(result: 'WIN' | 'LOSS' | 'BREAKEVEN') {
    if (!globalState.riskStats) {
        resetRiskStats();
    }
    
    const stats = globalState.riskStats!;
    stats.lastTradeTime = Date.now();
    
    if (result === 'LOSS') {
        stats.dailyLoss += 1;
        stats.consecutiveLosses += 1;
    } else if (result === 'WIN') {
        stats.consecutiveLosses = 0;
    }
    
    if (stats.dailyLoss >= riskConfig.maxDailyLoss || stats.consecutiveLosses >= riskConfig.maxConsecutiveLosses) {
        stats.drawdownLock = true;
        addLog(`DRAWDOWN LOCK ENGAGED! Trading paused to protect capital.`, 'warn');
    }
}

export function resetRiskStats() {
    globalState.riskStats = {
        dailyLoss: 0,
        consecutiveLosses: 0,
        drawdownLock: false,
        tradesToday: 0,
        lastTradeTime: 0
    };
    addLog(`Risk statistics reset for new session`, 'info');
}

export function getAdaptiveCooldownMs(): number {
    const stats = globalState.riskStats;
    if (!stats) return riskConfig.baseCooldownMs;
    // Penalty cooldown
    if (stats.consecutiveLosses >= 2) return riskConfig.baseCooldownMs * 3; // 45 mins
    if (stats.consecutiveLosses === 1) return riskConfig.baseCooldownMs * 2; // 30 mins
    return riskConfig.baseCooldownMs;
}

export function isTradingAllowed(): boolean {
    if (!globalState.riskStats) {
        resetRiskStats();
    }
    
    const stats = globalState.riskStats!;
    if (stats.drawdownLock) return false;
    
    const cooldownMs = getAdaptiveCooldownMs();
    if (Date.now() - stats.lastTradeTime < cooldownMs) {
        return false;
    }

    const { riskPercent } = getAdaptiveRiskProfile(1.0);
    if (riskPercent <= 0) return false;

    return true;
}

export function validateRiskMetrics(entry: number, sl: number, tp: number, currentAtr: number): boolean {
    const risk = Math.abs(entry - sl);
    const reward = Math.abs(tp - entry);
    
    if (risk === 0) return false;
    const rr = reward / risk;
    
    const profile = getAdaptiveRiskProfile(currentAtr);

    if (rr < profile.rrRequirement) {
        addLog(`Rejected: Risk-Reward (${rr.toFixed(2)}) is below adaptive minimum ${profile.rrRequirement.toFixed(2)} (Regime: ${profile.regime})`, 'warn');
        return false;
    }
    
    if (reward <= riskConfig.maxSpread * 2) {
         return false;
    }
    
    return true;
}
