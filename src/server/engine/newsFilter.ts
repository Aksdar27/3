import { globalState, addLog } from '../state.js';

let newsEvents: { time: number, level: string, currency: string, event: string }[] = [];
let lastFetch = 0;

export async function fetchEconomicCalendar() {
    if (Date.now() - lastFetch < 3600 * 1000) return; // cache 1 hour
    
    // Prefer FMP_API_KEY from env
    const apiKey = process.env.FMP_API_KEY;
    if (apiKey) {
        try {
            const today = new Date().toISOString().split('T')[0];
            const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
            
            const res = await fetch(`https://financialmodelingprep.com/api/v3/economic_calendar?from=${today}&to=${nextWeek}&apikey=${apiKey}`);
            const data = await res.json();
            
            newsEvents = [];
            if (Array.isArray(data)) {
                for (const item of data) {
                    if (item.currency === 'USD') {
                        newsEvents.push({
                            time: new Date(item.date).getTime(),
                            level: item.impact,
                            currency: item.currency,
                            event: item.event
                        });
                    }
                }
            }
            lastFetch = Date.now();
            addLog(`Fetched ${newsEvents.length} USD News Events directly from FMP API`);
        } catch(e) {
            console.error(e);
        }
    }
}

export function isNewsEmbargo(timestamp: number = Date.now()): { safe: boolean, reason?: string } {
    // 1. Real API Checks
    if (newsEvents.length > 0) {
        for (const item of newsEvents) {
            const diff = (timestamp - item.time) / 60000; 
            // -15 minutes before to +30 minutes after
            if (diff >= -15 && diff <= 30) {
                const name = item.event.toLowerCase();
                const isHighImpact = item.level === 'High' || name.includes('nfp') || name.includes('nonfarm') || name.includes('cpi') || name.includes('fomc') || name.includes('powell') || name.includes('fed');
                
                if (isHighImpact) {
                     return { safe: false, reason: `News Embargo: ${item.event}` };
                }
            }
        }
        return { safe: true }; // If we have API data and it's clear, return safe.
    }

    // 2. Fallbacks
    const d = new Date(timestamp);
    const day = d.getUTCDay(); // 0 is Sunday
    const hour = d.getUTCHours();
    const min = d.getUTCMinutes();
    const date = d.getUTCDate();
    const month = d.getUTCMonth(); // 0-11
    
    // NFP is usually first Friday of the month at 13:30 UTC
    if (day === 5 && date <= 7) {
        if (hour === 13 && min >= 15 && min <= 45) {
            return { safe: false, reason: 'NFP Release Window' };
        }
    }
    
    // CPI is usually around 13-15th at 13:30 UTC (approximation for now without dynamic API)
    if ((date >= 12 && date <= 16) && hour === 13 && min >= 15 && min <= 45) {
        // We warn but maybe don't strictly ban unless we know the exact day, here we approximate
    }
    
    // FOMC is usually Wednesday 18:00 UTC (sometimes 19:00 UTC)
    if (day === 3 && (date >= 14 && date <= 22) && hour >= 18 && hour <= 20) {
        return { safe: false, reason: 'FOMC Meeting Window' };
    }
    
    // We can allow by default since it requires dynamic API connection
    return { safe: true };
}
