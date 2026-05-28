import { Candle, Signal, BacktestStats } from '../../types.js';
import { updateWilderATR } from './volatility.js';
import { detectLiquidityPools } from './liquidity.js';
import { detectSweep } from './sweepDetector.js';
import { validateBOS, validateFVG } from './marketStructure.js';
import { analyzeVolumeParticipant } from './volume.js';
import { updateOrderBlocks, activeOBs, OrderBlock } from './orderBlock.js';

export interface ExtendedBacktestStats extends BacktestStats {
    expectancy: number;
    riskOfRuin: number; 
    profitFactor: number;
    survivabilityScore: number;
}

export class BacktestEngine {
    private history: Candle[] = [];
    private simulatedSignals: Signal[] = [];
    private balance = 10000;
    private maxDrawdown = 0;
    private peakBalance = 10000;

    constructor(data: Candle[]) {
        this.history = data;
    }

    public runSimulation(): ExtendedBacktestStats {
        let m1Candles: Candle[] = [];
        let m15Candles: Candle[] = [];
        let atr = 0;

        for (let i = 0; i < this.history.length; i++) {
            const candle = this.history[i];
            m1Candles.push(candle);
            if (m1Candles.length > 200) m1Candles.shift();
            
            if (i % 15 === 0) {
                 m15Candles.push({
                     timestamp: candle.timestamp,
                     open: m1Candles[Math.max(0, m1Candles.length-15)]?.open || candle.open,
                     high: Math.max(...m1Candles.slice(-15).map(c => c.high)),
                     low: Math.min(...m1Candles.slice(-15).map(c => c.low)),
                     close: candle.close,
                     volume: m1Candles.slice(-15).reduce((a, b) => a + (b.volume || 1), 0)
                 });
                 if (m15Candles.length > 200) m15Candles.shift();
                 atr = updateWilderATR(m15Candles);
            }
        }
        return this.generateStats();
    }
    
    public performAdvancedMonteCarlo(iterations: number = 1000, maxTrades: number = 200, winProb: number, avgRR: number): { maxSimulatedDD: number, riskOfRuin: number, meanEndingBalance: number } {
        let maxSimulatedDD = 0;
        let ruinCount = 0;
        let totalEndingBalance = 0;
        
        for (let idx=0; idx<iterations; idx++) {
            let simBalance = 10000;
            let simPeak = 10000;
            let simDD = 0;
            
            for (let t=0; t<maxTrades; t++) {
                const isWin = Math.random() < winProb;
                if (isWin) {
                     simBalance += (simBalance * 0.01 * avgRR);
                     if (simBalance > simPeak) simPeak = simBalance;
                } else {
                     simBalance -= (simBalance * 0.01); 
                     const dd = (simPeak - simBalance) / simPeak;
                     if (dd > simDD) simDD = dd;
                }
                
                if (simBalance < 5000) {
                    ruinCount++;
                    break; 
                }
            }
            if (simDD > maxSimulatedDD) maxSimulatedDD = simDD;
            totalEndingBalance += simBalance;
        }
        
        return {
            maxSimulatedDD: maxSimulatedDD * 100,
            riskOfRuin: (ruinCount / iterations) * 100,
            meanEndingBalance: totalEndingBalance / iterations
        };
    }

    private generateStats(): ExtendedBacktestStats {
        const wins = this.simulatedSignals.filter(s => s.result === 'WIN').length;
        const losses = this.simulatedSignals.filter(s => s.result === 'LOSS').length;
        const bes = this.simulatedSignals.filter(s => s.result === 'BREAKEVEN').length;
        const total = wins + losses + bes;
        
        const winR = total > 0 ? wins / total : 0;
        const avgRR = 2.0; 
        const avgWin = 200; 
        const avgLoss = 100; 

        // Profit Factor
        const grossProfit = wins * avgWin;
        const grossLoss = losses * avgLoss;
        const profitFactor = grossLoss === 0 ? grossProfit : grossProfit / grossLoss;

        // Expectancy 
        const lossR = total > 0 ? losses / total : 0;
        const expectancy = (winR * avgRR) - (lossR * 1);

        let riskOfRuin = 0;
        if (expectancy > 0) {
            const probArr = this.performAdvancedMonteCarlo(500, 100, winR, avgRR);
            riskOfRuin = probArr.riskOfRuin;
        } else {
            riskOfRuin = 100; 
        }

        const survivabilityScore = Math.max(0, 100 - riskOfRuin);

        return {
            totalTrades: total,
            wins,
            losses,
            breakevens: bes,
            winRate: winR * 100,
            avgRR: avgRR, 
            maxDrawdown: this.maxDrawdown,
            expectancy,
            riskOfRuin,
            profitFactor,
            survivabilityScore
        };
    }
}
