import WebSocket from 'ws';
import { globalState, addLog, broadcastState } from './state.js';
import { sendTelegramAlert } from './telegram.js';
import { processSMCLogic } from './engine/index.js';

let wsClient: WebSocket | null = null;
let fallbackInterval: NodeJS.Timeout | null = null;
let pingInterval: NodeJS.Timeout | null = null;
let watchdogInterval: NodeJS.Timeout | null = null;
let memoryMonitorInterval: NodeJS.Timeout | null = null;

let reconnectAttempts = 0;
const MAX_BACKOFF_MS = 60000;

export function initTwelveDataWs() {
    if (wsClient && (wsClient.readyState === WebSocket.OPEN || wsClient.readyState === WebSocket.CONNECTING)) {
        return;
    }

    if (wsClient) {
        wsClient.removeAllListeners();
        wsClient.close();
        wsClient = null;
    }
    if (fallbackInterval) {
        clearInterval(fallbackInterval);
        fallbackInterval = null;
    }
    if (pingInterval) {
        clearInterval(pingInterval);
        pingInterval = null;
    }
    if (watchdogInterval) {
        clearInterval(watchdogInterval);
        watchdogInterval = null;
    }

    const key = globalState.settings.twelveDataApiKey;
    if (!key) {
        globalState.status = 'ERROR';
        return;
    }

    addLog(`Connecting to TwelveData WebSocket... (Attempt: ${reconnectAttempts + 1})`);
    globalState.status = 'CONNECTING';
    broadcastState();

    wsClient = new WebSocket(`wss://ws.twelvedata.com/v1/quotes/price?apikey=${key}`);
    
    wsClient.on('open', () => {
        addLog('TwelveData Connected.');
        globalState.status = 'LIVE';
        globalState.lastConnectTime = Date.now();
        reconnectAttempts = 0; // Reset on success

        wsClient?.send(JSON.stringify({
            "action": "subscribe",
            "params": { "symbols": "XAU/USD" }
        }));
        
        pingInterval = setInterval(() => {
            if (wsClient && wsClient.readyState === WebSocket.OPEN) {
                wsClient.send(JSON.stringify({ "action": "heartbeat" }));
            }
        }, 10000);
    });

    wsClient.on('message', (data) => {
        try {
            const parsed = JSON.parse(data.toString());
            if (parsed.event === 'heartbeat') return;
            if (parsed.event === 'price' && parsed.symbol === 'XAU/USD') {
                globalState.price = parseFloat(parsed.price);
                globalState.lastTickTime = Date.now();
                if (globalState.status === 'ERROR' || globalState.status === 'CONNECTING') {
                    globalState.status = 'LIVE';
                }
                processSMCLogic(globalState.price);
                broadcastState();
            } else if (parsed.status === 'error') {
                addLog(`WS Error: ${parsed.message}`, 'error');
                if (parsed.message.includes('429') || parsed.message.toLowerCase().includes('limit')) {
                    sendTelegramAlert(`TwelveData API Quota Exhausted.\nSwitching to Fallback if enabled.`);
                    if (globalState.settings.autoSwitchFallback) {
                        startYahooFallback();
                    } else {
                        globalState.status = 'ERROR';
                    }
                }
            }
        } catch(e) {}
    });

    wsClient.on('close', (code, reason) => {
        const reasonStr = reason ? reason.toString() : 'Unknown';
        addLog(`TwelveData Disconnected (Code: ${code}, Reason: ${reasonStr})`, 'warn');
        if (pingInterval) {
            clearInterval(pingInterval);
            pingInterval = null;
        }
        if (globalState.status !== 'FALLBACK') {
            globalState.status = 'ERROR';
            const backoffDelay = Math.min(1000 * Math.pow(2, reconnectAttempts), MAX_BACKOFF_MS);
            reconnectAttempts++;
            addLog(`Reconnecting in ${backoffDelay / 1000}s...`, 'info');
            setTimeout(() => {
                initTwelveDataWs();
            }, backoffDelay);
        }
    });

    wsClient.on('error', (err) => {
        addLog(`WS Error: ${err.message}`, 'error');
    });

    watchdogInterval = setInterval(() => {
        if (globalState.status === 'LIVE' && (Date.now() - (globalState.lastTickTime || 0) > 15000)) {
            globalState.status = 'ERROR';
            addLog('Data stale >15s, marked offline', 'warn');
            broadcastState();
        }
    }, 1000);

    if (!memoryMonitorInterval) {
        memoryMonitorInterval = setInterval(() => {
            const usage = process.memoryUsage();
            const mb = Math.round(usage.rss / 1024 / 1024);
            if (mb > 150) {
                // If using too much memory on Railway, warn
                addLog(`High memory usage: ${mb}MB`, 'warn');
                if (mb > 300) {
                     sendTelegramAlert(`CRITICAL: Memory usage extremely high (${mb}MB). Approaching OOM kill.`);
                }
            }
        }, 60000); // Check every minute
    }
}

export function startYahooFallback() {
    if (wsClient) {
        wsClient.close();
    }
    if (watchdogInterval) {
        clearInterval(watchdogInterval);
        watchdogInterval = null;
    }
    
    addLog('Switching to Yahoo Finance REST Fallback.', 'warn');
    globalState.status = 'FALLBACK';
    
    if (fallbackInterval) clearInterval(fallbackInterval);
    fallbackInterval = setInterval(async () => {
        try {
            const res = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/XAUUSD=X');
            const data: any = await res.json();
            const meta = data?.chart?.result?.[0]?.meta;
            if (meta?.regularMarketPrice) {
                globalState.price = meta.regularMarketPrice;
                globalState.lastTickTime = Date.now();
                processSMCLogic(globalState.price);
                broadcastState();
            }
        } catch(e: any) {
            addLog(`Yahoo Fetch Error: ${e.message}`, 'error');
        }
    }, 5000);
}
