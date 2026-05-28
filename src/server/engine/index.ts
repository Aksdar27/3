import { globalState, addLog, broadcastState } from '../state.js';
import { sendTelegramSignal } from '../telegram.js';
import { addFirebaseSignal } from '../db.js';
import { Signal, SmcState, TradeState } from '../../types.js';

import { isSessionValid } from './session.js';
import { updateWilderATR, isVolatilityValid, currentWilderAtr } from './volatility.js';
import { isTradingAllowed, validateRiskMetrics, riskConfig } from './risk.js';
import { validateWithGeminiStrict } from './geminiValidator.js';
import { checkOpenTrades } from './analytics.js';
import { 
    m1Candles, m5Candles, m15Candles, h1Candles,
    updateCandles, detectHTFTrend, detectH1Bias, getPivots, validateBOS, validateFVG, isMarketRanging
} from './marketStructure.js';
import { evaluateTradeScore } from './tradeScorer.js';
import { detectLiquidityPools, LiquidityPool } from './liquidity.js';
import { detectSweep } from './sweepDetector.js';
import { checkInducement } from './inducement.js';
import { isNewsEmbargo, fetchEconomicCalendar } from './newsFilter.js';
import { updateOrderBlocks, activeOBs, OrderBlock } from './orderBlock.js';
import { analyzeVolumeParticipant, registerTick } from './volume.js';
import { processActiveTrade } from './tradeManager.js';
import { transitionState } from './fsm.js';
import { getCurrentRegime, detectMarketRegime } from './regime.js';
import { simulateRealisticFill } from './execution.js';

let lastGeminiCallTime = 0;
let geminiCooldownMs = 30000;
let pools: LiquidityPool[] = [];
let calendarFetchTime = 0;

export function processSMCLogic(price: number, timestamp: number = Date.now()) {
    registerTick(timestamp);
    updateCandles(price, timestamp);
    checkOpenTrades(price);
    
    const atr = updateWilderATR(m15Candles);
    updateOrderBlocks(m1Candles, atr);
    detectMarketRegime(price);

    if (Date.now() - calendarFetchTime > 3600 * 1000) {
        fetchEconomicCalendar(); // background fetch
        calendarFetchTime = Date.now();
    }

    if (!globalState.smcState) {
        globalState.smcState = {
            step: 'WAITING',
            currentH1Bias: 'NEUTRAL',
            currentM15Trend: 'NEUTRAL',
            activeSetup: null,
            sweepPrice: null,
            bosPrice: null,
            fvgZone: null,
            obZone: null,
            recentHigh: null,
            recentLow: null,
            equalHighsSwept: false,
            equalLowsSwept: false,
            bosScore: 0,
            fvgScore: 0,
            aiConfidence: 0
        };
    }

    const state = globalState.smcState;
    const mode = globalState.settings.mode || 'AGGRESSIVE';
    
    state.currentH1Bias = detectH1Bias();
    state.currentM15Trend = detectHTFTrend();
    
    // Trade Management processing lock
    if (state.activeTrade) {
        processActiveTrade(price, state, atr);
        if (!state.activeTrade) {
            // Trade just closed
        } else {
            if (state.activeTrade.status === 'ACTIVE') transitionState(state, 'TRADE_ACTIVE', 'Trade still active');
            else if (state.activeTrade.status === 'PARTIAL_1') transitionState(state, 'PARTIAL_EXIT', 'Partial 1 achieved');
            else if (state.activeTrade.status === 'PARTIAL_2') transitionState(state, 'TRAILING', 'Trailing activation');
            return;
        }
    }
    
    const volMetrics = analyzeVolumeParticipant(m1Candles, atr, timestamp);
    
    // Hard Reject Filters evaluated upfront in WAITING to avoid wasting states
    if (state.step === 'WAITING') {
        const newsCheck = isNewsEmbargo(timestamp);
        if (!newsCheck.safe) {
            return;
        }

        if (!isSessionValid() || !isVolatilityValid(atr) || !isTradingAllowed()) {
            return;
        }
        
        // Block new trades if volume is completely dry
        if (volMetrics.lowParticipation) return;

        // Periodically refresh liquidity pools and pivots
        if (m15Candles.length >= 20) {
            pools = detectLiquidityPools(m15Candles, atr, price);
        }
        
        if (m5Candles.length >= 5) {
            const { ph, pl, equalHighs, equalLows } = getPivots(m5Candles);
            if (ph && pl) {
                if (isMarketRanging(atr, ph, pl)) {
                     return;
                }
                state.recentHigh = ph;
                state.recentLow = pl;
                state.equalHighsSwept = equalHighs;
                state.equalLowsSwept = equalLows;
                
                // Check if actively sweeping right now (M1 candle level)
                if (m1Candles.length > 0) {
                     const currentM1 = m1Candles[m1Candles.length - 1];
                     const sweepCheck = detectSweep(m1Candles, pools, atr);
                     
                     if (sweepCheck.swept && sweepCheck.pool) {
                         if (sweepCheck.pool.type === 'HIGH') {
                             if (!(mode === 'CONSERVATIVE' && state.currentM15Trend === 'BULLISH')) {
                                 state.activeSetup = 'SELL';
                                 state.sweepPrice = currentM1.high;
                                 transitionState(state, 'SWEEP_DETECTED', 'BSL Sweep detected');
                                 state.equalHighsSwept = sweepCheck.pool.strength >= 2;
                                 addLog(`[${mode}] BSL Sweep detected at pool ${sweepCheck.pool.level} (Score: ${sweepCheck.score})`, 'info');
                             }
                         } else {
                             if (!(mode === 'CONSERVATIVE' && state.currentM15Trend === 'BEARISH')) {
                                 state.activeSetup = 'BUY';
                                 state.sweepPrice = currentM1.low;
                                 transitionState(state, 'SWEEP_DETECTED', 'SSL Sweep detected');
                                 state.equalLowsSwept = sweepCheck.pool.strength >= 2;
                                 addLog(`[${mode}] SSL Sweep detected at pool ${sweepCheck.pool.level} (Score: ${sweepCheck.score})`, 'info');
                             }
                         }
                     }
                }
            }
        }
    } 
    else if (state.step === 'SWEEP_DETECTED') {
        const displacement = atr * 0.4;
        
        if (state.activeSetup === 'SELL') {
            const level = state.sweepPrice! - displacement;
            if (price < level && m1Candles.length > 0) {
                // Must have volume expansion on CHoCH down
                if (!volMetrics.volExpansion) return; 
                
                const bosCheck = validateBOS(m1Candles[m1Candles.length - 1], level, 'DOWN', atr);
                if (bosCheck.valid) {
                    state.bosPrice = price;
                    state.bosScore = bosCheck.score;
                    transitionState(state, 'BOS_CONFIRMED', 'CHoCH Confirmed Down');
                    addLog(`[${mode}] CHoCH Confirmed (Bearish). Type: ${bosCheck.type}, Score: ${bosCheck.score}`, 'info');
                }
            }
        } else if (state.activeSetup === 'BUY') {
            const level = state.sweepPrice! + displacement;
            if (price > level && m1Candles.length > 0) {
                // Must have volume expansion on CHoCH up
                if (!volMetrics.volExpansion) return; 
                
                const bosCheck = validateBOS(m1Candles[m1Candles.length - 1], level, 'UP', atr);
                if (bosCheck.valid) {
                    state.bosPrice = price;
                    state.bosScore = bosCheck.score;
                    transitionState(state, 'BOS_CONFIRMED', 'CHoCH Confirmed Up');
                    addLog(`[${mode}] CHoCH Confirmed (Bullish). Type: ${bosCheck.type}, Score: ${bosCheck.score}`, 'info');
                }
            }
        }

        // Invalidation: Price goes too far beyond sweep
        if (state.activeSetup === 'SELL' && price > state.sweepPrice! + atr * 2) {
             transitionState(state, 'INVALIDATED', 'Price pushed too high beyond sweep');
        } else if (state.activeSetup === 'BUY' && price < state.sweepPrice! - atr * 2) {
             transitionState(state, 'INVALIDATED', 'Price pushed too low beyond sweep');
        }
    } 
    else if (state.step === 'BOS_CONFIRMED') {
        let fvgFound = false;
        if (m1Candles.length >= 3) {
            for (let i = m1Candles.length - 2; i > m1Candles.length - 5 && i >= 1; i--) {
                const c1 = m1Candles[i-1];
                const c3 = m1Candles[i+1];
                if (!c1 || !c3) continue;
                
                const fvgCheck = validateFVG(c1, c3, state.activeSetup === 'BUY' ? 'UP' : 'DOWN', atr);

                if (fvgCheck.valid) {
                    state.fvgZone = fvgCheck.fvgZone;
                    state.fvgScore = fvgCheck.score;
                    fvgFound = true;
                    break;
                }
            }
        }
        
        let obFound = false;
        if (!fvgFound) {
             const targetOBType = state.activeSetup === 'BUY' ? 'BULLISH' : 'BEARISH';
             for (let ob of activeOBs) {
                 if (ob.type === targetOBType && !ob.mitigated && !ob.breaker) {
                     obFound = true;
                     break;
                 }
             }
        }
        
        if (fvgFound || obFound) {
             if (transitionState(state, 'MITIGATION_WAIT', 'Structure mitigation zones found')) {
                 addLog(`[${mode}] Structure mitigation zones found. Waiting for retracement.`, 'info');
             }
        } else {
             if (state.activeSetup === 'SELL' && price < state.bosPrice! - atr * 2.5) transitionState(state, 'COOLDOWN', 'Missed entry down');
             if (state.activeSetup === 'BUY' && price > state.bosPrice! + atr * 2.5) transitionState(state, 'COOLDOWN', 'Missed entry up');
        }
    } 
    else if (state.step === 'MITIGATION_WAIT' || state.step === 'FVG_FOUND' as any) {
        const inRetestZoneFVG = state.fvgZone ? (state.activeSetup === 'SELL' ? 
            (price >= state.fvgZone.bottom && price <= state.fvgZone.top + (atr * 0.2)) :
            (price <= state.fvgZone.top && price >= state.fvgZone.bottom - (atr * 0.2))) : false;

        let obScore = 0;
        const targetOBType = state.activeSetup === 'BUY' ? 'BULLISH' : 'BEARISH';
        for (let ob of activeOBs) {
            if (ob.type === targetOBType && !ob.mitigated && !ob.breaker) {
                if (price >= ob.refinedBottom - (atr*0.1) && price <= ob.refinedTop + (atr*0.1)) {
                    obScore = ob.score;
                    break;
                }
            }
        }

        if (inRetestZoneFVG || obScore > 0) {
            const spreadSpike = m1Candles.length > 0 && Math.abs(m1Candles[m1Candles.length-1].high - m1Candles[m1Candles.length-1].low) > (atr * 1.5);
            if (spreadSpike) {
                addLog(`Spread Spike Rejection: Tick size exceeded allowed variance`, 'warn');
                transitionState(state, 'COOLDOWN', 'Spread spike validation fail');
                return;
            }

        // Trap Inducement Check (SMC Liquidity Trap)
        const hasInducement = checkInducement(m1Candles, atr, state.activeSetup!);
        if (!hasInducement && mode === 'CONSERVATIVE') {
           // We might block entry if no inducement is built
        }

        if (transitionState(state, 'ENTRY_READY', 'Retest tapped premium zone. Evaluating entry.')) {
            runValidationAndSignal(price, state.activeSetup!, price, atr, state, obScore, volMetrics.score);
        }
    }
    
    // Invalidation for failed retracement (impulsive runaway)
    if (state.activeSetup === 'SELL' && price < state.bosPrice! - atr * 2.0) {
         transitionState(state, 'COOLDOWN', 'Runaway impulsive down without retest');
    } else if (state.activeSetup === 'BUY' && price > state.bosPrice! + atr * 2.0) {
         transitionState(state, 'COOLDOWN', 'Runaway impulsive up without retest');
    }
}
else if (state.step === 'INVALIDATED' || state.step === 'COOLDOWN') {
   if (m15Candles.length > 0 && m15Candles[m15Candles.length - 1].timestamp + (15 * 60 * 1000) < timestamp) {
       transitionState(state, 'WAITING', 'State cooldown expired');
   } else {
       setTimeout(() => { 
           if(state.step === 'COOLDOWN' || state.step === 'INVALIDATED') {
               transitionState(state, 'WAITING', 'Fallback timer cooldown expired');
           }
       }, 60000);
   }
}
}

async function runValidationAndSignal(price: number, direction: 'BUY' | 'SELL', targetEntryPrice: number, atr: number, smcState: SmcState, obScore: number = 0, volumeScore: number = 50) {
if (!isSessionValid() || !isVolatilityValid(atr) || !isTradingAllowed()) {
    if (globalState.smcState) transitionState(globalState.smcState, 'WAITING', 'Risk limits hit before validation');
    return;
}

const now = Date.now();
if (now - lastGeminiCallTime < geminiCooldownMs) {
    if (globalState.smcState) transitionState(globalState.smcState, 'WAITING', 'Gemini timeout');
    return;
}
lastGeminiCallTime = now;

// Simulation realistic entry latency and fill
const { regime } = getCurrentRegime();
const fill = simulateRealisticFill(targetEntryPrice, 'MARKET', direction, atr, regime, 1.0);

if (fill.status === 'REJECTED') {
    addLog(`Entry Rejected by simulated broker feed (Regime: ${regime}).`, 'warn');
    if (globalState.smcState) transitionState(globalState.smcState, 'COOLDOWN', 'Broker requote/reject');
    return;
}

const entryPrice = fill.price; // Update to actual executed price
if (fill.status === 'SLIPPED') {
    addLog(`Slippage experienced on entry: ${fill.slippageTicks.toFixed(2)} ticks.`, 'warn');
}

if (!transitionState(globalState.smcState!, 'ENTRY_TRIGGERED', 'Simulated execution complete')) return;

// Trigger structured AI Validator
const cnf = await validateWithGeminiStrict(entryPrice, direction, entryPrice, atr);

if (cnf.reason === 'Quota Exceeded') {
    geminiCooldownMs = 5 * 60 * 1000;
    if (globalState.smcState) transitionState(globalState.smcState, 'COOLDOWN', 'Quota Exceeded');
    return;
} else {
    geminiCooldownMs = 30000;
}

const mode = globalState.settings.mode || 'AGGRESSIVE';

// JSON Validation Criteria Check
if (cnf.valid && (cnf.signal === direction || cnf.signal !== 'WAIT')) {
    
    // Ensure no stale signals
    if (Math.abs(price - entryPrice) > atr * 0.5) {
         addLog(`Signal Stale: Price moved too far post-execution`, 'warn');
         if (globalState.smcState) transitionState(globalState.smcState, 'COOLDOWN', 'Stale after execution');
         return;
    }

    const htfAligned = (direction === 'BUY' && smcState.currentH1Bias === 'BULLISH') || (direction === 'SELL' && smcState.currentH1Bias === 'BEARISH');
    const eqSwept = direction === 'BUY' ? !!smcState.equalLowsSwept : !!smcState.equalHighsSwept;

    const scoreCheck = evaluateTradeScore({
        bosScore: smcState.bosScore || 0,
        fvgScore: smcState.fvgScore || 0,
        obScore: obScore,
        volumeScore: volumeScore,
        aiConfidence: cnf.confidence,
        htfAligned,
        equalLiquiditySwept: eqSwept,
        atrValid: isVolatilityValid(atr),
        sessionValid: isSessionValid()
    }, mode);

    if (!scoreCheck.valid) {
         addLog(`AI Validation Rejected: Score too low (${scoreCheck.totalScore.toFixed(1)})`, 'warn');
         if (globalState.smcState) transitionState(globalState.smcState, 'WAITING', 'Score rejected');
         return;
    }

    // Duplicate Check
    const lastSignalTime = globalState.signals.length > 0 ? globalState.signals[0].timestamp : 0;
    if (Date.now() - lastSignalTime < 5 * 60 * 1000) {
         addLog(`Duplicate Signal Protection (wait 5m)`, 'warn');
         if (globalState.smcState) transitionState(globalState.smcState, 'COOLDOWN', 'Anti-Spam active');
         return;
    }

    const risk = atr * 1.5; 
    const entry = entryPrice;
    let sl = (direction === 'BUY' ? entry - risk : entry + risk);
    let tp1 = (direction === 'BUY' ? entry + (risk * 1.0) : entry - (risk * 1.0));
    let tp2 = (direction === 'BUY' ? entry + (risk * 1.5) : entry - (risk * 1.5));
    let tp3 = (direction === 'BUY' ? entry + (risk * 2.0) : entry - (risk * 2.0));
    
    if (!validateRiskMetrics(entry, sl, tp1, atr)) {
         addLog(`AI Validation Rejected: Risk metrics failed check`, 'warn');
         if (globalState.smcState) transitionState(globalState.smcState, 'COOLDOWN', 'Risk limits failed');
         return;
    }

    const newSignal: Signal = {
        id: Date.now().toString(),
        timestamp: Date.now(),
        pair: 'XAUUSD',
        direction: direction,
        entry, sl, tp1, tp2, tp3,
        rr: Math.abs(tp1 - entry) / Math.abs(sl - entry),
        reason: `${cnf.reason} (Anomalies: ${cnf.anomalies?.join(',') || 'None'}) (Score: ${scoreCheck.totalScore.toFixed(1)})`,
        confidence: cnf.confidence,
        status: 'ACTIVE',
        mode: mode
    };

    globalState.signals.unshift(newSignal);
    if (globalState.signals.length > 50) globalState.signals.pop();
    addLog(`[${newSignal.mode}] Final Signal Approved & Executed: ${direction} at ${entry} (Slip: ${fill.slippageTicks})`);
    
    sendTelegramSignal(newSignal).catch(e => console.error("Error sending tg signal", e));
    addFirebaseSignal(newSignal).catch(e => console.error("Error sending fb signal", e));
    
    if (globalState.smcState) {
         if (transitionState(globalState.smcState, 'TRADE_ACTIVE', 'Trade open')) {
             globalState.smcState.activeTrade = {
                 id: newSignal.id,
                 direction: direction,
                 entryPrice: entry,
                 currentSL: sl,
                 tp1, tp2, tp3,
                 status: 'ACTIVE',
                 size: fill.filledSize,
                 highestPnL: 0
             };
         }
    }
    broadcastState();
} else {
    addLog(`AI Validation Rejected: ${cnf.reason || 'Confidence low'}`, 'warn');
    if (globalState.smcState) transitionState(globalState.smcState, 'COOLDOWN', 'Gemini rejected');
}
}

