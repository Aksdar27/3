import { TradeState } from '../../types.js';

export interface FillResult {
    price: number;
    status: 'FILLED' | 'PARTIAL' | 'SLIPPED' | 'REJECTED';
    slippageTicks: number;
    filledSize: number;
}

export function simulateRealisticFill(
    targetPrice: number, 
    orderType: 'MARKET' | 'LIMIT' | 'STOP', 
    direction: 'BUY' | 'SELL',
    currentVolatility: number,
    regime: string,
    requestedSize: number = 1.0
): FillResult {
    const baseWiden = regime === 'NEWS_VOLATILITY' ? 0.3 : (regime === 'LOW_LIQUIDITY' ? 0.2 : 0.05);

    let slipBias = 0;
    let probReject = 0;
    
    if (regime === 'EXPANDING_VOLATILITY' || regime === 'NEWS_VOLATILITY') {
        slipBias = currentVolatility * 0.15; // High slippage in volatile times
        probReject = 0.1; // 10% reject/requote
    } else if (regime === 'LOW_LIQUIDITY') {
        probReject = 0.05;
        slipBias = currentVolatility * 0.05;
    }

    // Reject check for strict environments
    if (Math.random() < probReject) {
        return { price: targetPrice, status: 'REJECTED', slippageTicks: 0, filledSize: 0 };
    }

    // Slippage calculation
    let executedPrice = targetPrice;
    let actualSlip = 0;
    let status: 'FILLED' | 'PARTIAL' | 'SLIPPED' = 'FILLED';

    // Limit orders don't slip worse than target, but might partial fill
    if (orderType === 'LIMIT') {
        const isPartial = Math.random() < (regime === 'LOW_LIQUIDITY' ? 0.4 : 0.1);
        const fillAmount = isPartial ? requestedSize * (Math.random() * 0.5 + 0.1) : requestedSize;
        status = isPartial ? 'PARTIAL' : 'FILLED';
        
        // Positive slippage is possible but rare
        if (Math.random() < 0.1) {
            actualSlip = (Math.random() * 0.05);
            executedPrice = direction === 'BUY' ? targetPrice - actualSlip : targetPrice + actualSlip;
            status = 'SLIPPED';
        }

        return {
            price: Number(executedPrice.toFixed(3)),
            status,
            slippageTicks: Number(actualSlip.toFixed(3)),
            filledSize: Number(fillAmount.toFixed(2))
        };
    }

    // Stop and Market orders suffer negative slippage
    actualSlip = baseWiden + (Math.random() * slipBias);
    executedPrice = direction === 'BUY' ? targetPrice + actualSlip : targetPrice - actualSlip;
    
    if (actualSlip > 0.05) status = 'SLIPPED';

    return {
        price: Number(executedPrice.toFixed(3)),
        status,
        slippageTicks: Number(actualSlip.toFixed(3)),
        filledSize: requestedSize
    };
}
