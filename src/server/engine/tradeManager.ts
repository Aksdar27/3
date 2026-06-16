import { TradeState, Signal, SmcState } from '../../types.js';
import { globalState, addLog } from '../state.js';
import { simulateRealisticFill } from './execution.js';
import { getCurrentRegime } from './regime.js';
import { FSMState, transitionState } from './fsm.js';
import { updateRiskStats } from './risk.js';
import { updateBacktestStats } from './analytics.js';
import { updateFirebaseSignal } from '../db.js';

export function processActiveTrade(price: number, smcState: SmcState, atr: number) {
    if (!smcState.activeTrade) return;

    const trade = smcState.activeTrade;

    const pnlInTicks = trade.direction === 'BUY' 
        ? (price - trade.entryPrice)
        : (trade.entryPrice - price);
        
    trade.highestPnL = Math.max(trade.highestPnL, pnlInTicks);
    
    const { regime } = getCurrentRegime();

    // STOP LOSS
    if (trade.direction === 'BUY' && price <= trade.currentSL) {
        const fill = simulateRealisticFill(trade.currentSL, 'STOP', 'SELL', atr, regime, trade.size);
        closeTrade('SL_HIT', trade, fill.price, smcState, fill.slippageTicks);
        return;
    }
    if (trade.direction === 'SELL' && price >= trade.currentSL) {
        const fill = simulateRealisticFill(trade.currentSL, 'STOP', 'BUY', atr, regime, trade.size);
        closeTrade('SL_HIT', trade, fill.price, smcState, fill.slippageTicks);
        return;
    }

    // TAKE PROFIT & PARTIALS
    if (trade.direction === 'BUY') {
        if (price >= trade.tp3) {
            const fill = simulateRealisticFill(trade.tp3, 'LIMIT', 'SELL', atr, regime, trade.size);
            closeTrade('TP_HIT', trade, fill.price, smcState, fill.slippageTicks);
            return;
        } else if (price >= trade.tp2 && trade.status !== 'PARTIAL_2') {
            const fill = simulateRealisticFill(trade.tp2, 'LIMIT', 'SELL', atr, regime, trade.size * 0.5);
            trade.status = 'PARTIAL_2';
            trade.currentSL = trade.entryPrice + (trade.highestPnL * 0.5);
            trade.size -= fill.filledSize;
            addLog(`Trade ${trade.id} TP2 hit. Partial exit at ${fill.price} + Trailing SL.`, 'info');
        } else if (price >= trade.tp1 && trade.status === 'ACTIVE') {
            const fill = simulateRealisticFill(trade.tp1, 'LIMIT', 'SELL', atr, regime, trade.size * 0.5);
            trade.status = 'PARTIAL_1';
            trade.currentSL = trade.entryPrice + 0.1;
            trade.size -= fill.filledSize;
            addLog(`Trade ${trade.id} TP1 hit. Partial exit at ${fill.price} + Secured BE.`, 'info');
            transitionState(smcState, 'PARTIAL_EXIT', 'TP1 Hit');
        }
    } else {
        if (price <= trade.tp3) {
            const fill = simulateRealisticFill(trade.tp3, 'LIMIT', 'BUY', atr, regime, trade.size);
            closeTrade('TP_HIT', trade, fill.price, smcState, fill.slippageTicks);
            return;
        } else if (price <= trade.tp2 && trade.status !== 'PARTIAL_2') {
            const fill = simulateRealisticFill(trade.tp2, 'LIMIT', 'BUY', atr, regime, trade.size * 0.5);
            trade.status = 'PARTIAL_2';
            trade.currentSL = trade.entryPrice - (trade.highestPnL * 0.5);
            trade.size -= fill.filledSize;
            addLog(`Trade ${trade.id} TP2 hit. Partial exit at ${fill.price} + Trailing SL.`, 'info');
        } else if (price <= trade.tp1 && trade.status === 'ACTIVE') {
            const fill = simulateRealisticFill(trade.tp1, 'LIMIT', 'BUY', atr, regime, trade.size * 0.5);
            trade.status = 'PARTIAL_1';
            trade.currentSL = trade.entryPrice - 0.1;
            trade.size -= fill.filledSize;
            addLog(`Trade ${trade.id} TP1 hit. Partial exit at ${fill.price} + Secured BE.`, 'info');
            transitionState(smcState, 'PARTIAL_EXIT', 'TP1 Hit');
        }
    }
    
    // Dynamic SL / Trailing Mechanism based on Risk / ATR
    if (trade.status === 'PARTIAL_1' || trade.status === 'PARTIAL_2') {
        const trailOffset = atr * 1.5;
        if (trade.direction === 'BUY') {
            if (price - trailOffset > trade.currentSL) {
                trade.currentSL = price - trailOffset;
                if (trade.status === 'PARTIAL_2') transitionState(smcState, 'TRAILING', 'Trailing updated');
            }
        } else {
            if (price + trailOffset < trade.currentSL) {
                trade.currentSL = price + trailOffset;
                if (trade.status === 'PARTIAL_2') transitionState(smcState, 'TRAILING', 'Trailing updated');
            }
        }
    }
}

function closeTrade(type: 'TP_HIT' | 'SL_HIT', trade: TradeState, filledPrice: number, smcState: SmcState, slip: number) {
    const signalIndex = globalState.signals.findIndex(s => s.id === trade.id);

    let resultType: 'WIN' | 'LOSS' | 'BREAKEVEN' = 'LOSS';
    if (type === 'TP_HIT') {
        resultType = 'WIN';
    } else if (type === 'SL_HIT') {
         if (trade.direction === 'BUY') {
             if (trade.currentSL > trade.entryPrice) resultType = 'WIN';
             else if (trade.currentSL === trade.entryPrice + 0.1) resultType = 'BREAKEVEN';
             else resultType = 'LOSS';
         } else {
             if (trade.currentSL < trade.entryPrice) resultType = 'WIN';
             else if (trade.currentSL === trade.entryPrice - 0.1) resultType = 'BREAKEVEN';
             else resultType = 'LOSS';
         }
    }
    
    let signalRR = 0;
    if (signalIndex >= 0) {
        const sig = globalState.signals[signalIndex];
        sig.status = 'CLOSED';
        sig.result = resultType;
        signalRR = sig.rr || 0;
        if (sig.firebaseId) updateFirebaseSignal(sig.firebaseId, { status: 'CLOSED', closedAt: Date.now(), result: resultType });
    }
    
    addLog(`Trade ${trade.id} closed due to ${resultType === 'BREAKEVEN' ? 'BREAKEVEN' : type} at ${filledPrice.toFixed(3)}. Result: ${resultType} (Slip: ${slip.toFixed(2)})`, resultType === 'WIN' ? 'info' : 'warn');
    
    updateRiskStats(resultType);
    updateBacktestStats(resultType, resultType === 'WIN' ? signalRR : 0);
    
    smcState.activeTrade = null;
    transitionState(smcState, 'COOLDOWN', 'Trade closed');
}
