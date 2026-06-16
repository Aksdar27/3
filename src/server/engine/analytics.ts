import { Signal } from '../../types.js';
import { globalState } from '../state.js';
import { updateFirebaseSignal } from '../db.js';
import { addLog } from '../state.js';
import { updateRiskStats } from './risk.js';

export function checkOpenTrades(price: number) {
    // The live position is exclusively managed by tradeManager.processActiveTrade.
    // Skip its signal here to avoid duplicate closes, conflicting statuses and double risk counting.
    const managedTradeId = globalState.smcState?.activeTrade?.id;
    for (const sig of globalState.signals) {
        if (managedTradeId && sig.id === managedTradeId) continue;
        if (sig.status === 'LIMIT_PLACED' || sig.status === 'PENDING') {
            if (sig.direction === 'BUY' && price <= sig.entry) { 
                sig.status = 'ACTIVE'; 
                addLog(`Signal ACTIVE: BUY at ${sig.entry.toFixed(2)}`, 'info'); 
                if (sig.firebaseId) updateFirebaseSignal(sig.firebaseId, { status: 'ACTIVE', activeAt: Date.now() });
            } else if (sig.direction === 'SELL' && price >= sig.entry) { 
                sig.status = 'ACTIVE'; 
                addLog(`Signal ACTIVE: SELL at ${sig.entry.toFixed(2)}`, 'info'); 
                if (sig.firebaseId) updateFirebaseSignal(sig.firebaseId, { status: 'ACTIVE', activeAt: Date.now() });
            }
        }
        
        if (sig.status === 'ACTIVE') {
            let hitSl = false;
            let hitTp: number | null = null;
            
            if (sig.direction === 'BUY') {
                if (price <= sig.sl) hitSl = true;
                else if (price >= sig.tp3) hitTp = 3;
                else if (price >= sig.tp2) hitTp = 2;
                else if (price >= sig.tp1) hitTp = 1;
            } else {
                if (price >= sig.sl) hitSl = true;
                else if (price <= sig.tp3) hitTp = 3;
                else if (price <= sig.tp2) hitTp = 2;
                else if (price <= sig.tp1) hitTp = 1;
            }
            
            if (hitSl) {
                sig.status = 'CLOSED';
                sig.result = sig.result === 'WIN' ? 'BREAKEVEN' : 'LOSS';
                addLog(`Signal HIT ${sig.result === 'BREAKEVEN' ? 'BE' : 'SL'}: ${sig.direction} at ${sig.sl.toFixed(2)}`, 'warn');
                if (sig.firebaseId) updateFirebaseSignal(sig.firebaseId, { status: 'CLOSED', closedAt: Date.now(), result: sig.result });
                updateRiskStats(sig.result);
                updateBacktestStats(sig.result);
            } else if (hitTp === 3) {
                sig.status = 'CLOSED';
                sig.result = 'WIN';
                addLog(`Signal FULL TP HIT: ${sig.direction} at ${sig.tp3.toFixed(2)}`, 'info');
                if (sig.firebaseId) updateFirebaseSignal(sig.firebaseId, { status: 'CLOSED', closedAt: Date.now(), result: 'WIN' });
                updateRiskStats('WIN');
                updateBacktestStats('WIN', sig.rr);
            } else if (hitTp) {
                if (!sig.result) {
                    sig.result = 'WIN';
                    sig.sl = sig.entry;
                    addLog(`Signal hit TP${hitTp}, moving SL to BE for ${sig.direction} at ${sig.sl.toFixed(2)}`, 'info');
                    if (sig.firebaseId) updateFirebaseSignal(sig.firebaseId, { sl: sig.sl, result: 'PARTIAL' });
                }
            }
        }
    }
}

export function updateBacktestStats(result: 'WIN' | 'LOSS' | 'BREAKEVEN', hitRR: number = 0) {
    if (!globalState.backtestStats) {
        globalState.backtestStats = {
            totalTrades: 0, wins: 0, losses: 0, breakevens: 0, winRate: 0, avgRR: 0, maxDrawdown: 0
        };
    }
    const bs = globalState.backtestStats;
    bs.totalTrades++;
    
    if (result === 'WIN') bs.wins++;
    else if (result === 'LOSS') bs.losses++;
    else if (result === 'BREAKEVEN') bs.breakevens++;
    
    bs.winRate = (bs.wins / bs.totalTrades) * 100;
    
    // Simplistic handling of Avg RR (Requires more robust tracker for partials normally)
    if (result === 'WIN') {
        const pastRRSum = bs.avgRR * (bs.wins - 1);
        bs.avgRR = (pastRRSum + hitRR) / bs.wins;
    }
}
