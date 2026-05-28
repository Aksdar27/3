import { Router } from 'express';
import { globalState, SSE_CLIENTS, saveSettings, addLog } from './state.js';
import { initTwelveDataWs } from './websocket.js';
import { getFirebaseHistory, db } from './db.js';
import { testTelegramConnection } from './telegram.js';
import { AppSettings } from '../types.js';

export const apiRouter = Router();

// Simple Memory Rate Limiter
const rateLimitMap = new Map<string, { count: number, resetTime: number }>();
const RATE_LIMIT_SEC = 20;
const rateLimiter = (limit: number) => (req: any, res: any, next: any) => {
    const ip = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    let record = rateLimitMap.get(ip);
    
    if (!record || now > record.resetTime) {
        record = { count: 1, resetTime: now + (RATE_LIMIT_SEC * 1000) };
    } else {
        record.count++;
    }
    
    rateLimitMap.set(ip, record);
    
    if (record.count > limit) {
        return res.status(429).json({ success: false, error: 'Too many requests, please try again later.' });
    }
    next();
};

apiRouter.get('/health', (req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
});

apiRouter.get('/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    
    SSE_CLIENTS.add(res);
    res.write(`data: ${JSON.stringify(globalState)}\n\n`);

    req.on('close', () => SSE_CLIENTS.delete(res));
});

apiRouter.post('/settings', rateLimiter(10), async (req, res) => {
    try {
        const payload = req.body;
        // Basic strict sanitization & validation
        if (typeof payload !== 'object' || payload === null) {
            return res.status(400).json({ success: false, error: 'Invalid payload' });
        }
        
        const mode = payload.mode === 'CONSERVATIVE' ? 'CONSERVATIVE' : 'AGGRESSIVE';
        
        const newSettings: AppSettings = {
            twelveDataApiKey: typeof payload.twelveDataApiKey === 'string' ? payload.twelveDataApiKey.trim() : '',
            geminiApiKey: typeof payload.geminiApiKey === 'string' ? payload.geminiApiKey.trim() : '',
            telegramBotToken: typeof payload.telegramBotToken === 'string' ? payload.telegramBotToken.trim() : '',
            telegramChatId: typeof payload.telegramChatId === 'string' ? payload.telegramChatId.trim() : '',
            autoSwitchFallback: !!payload.autoSwitchFallback,
            mockProbability: typeof payload.mockProbability === 'number' ? Math.max(0, Math.min(100, payload.mockProbability)) : 0,
            mode: mode
        };

        await saveSettings(newSettings, () => {
            initTwelveDataWs();
        });
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
});

apiRouter.get('/history', rateLimiter(30), async (req, res) => {
    if (!db) {
        res.json({ success: false, error: 'Database not connected' });
        return;
    }
    try {
        const signals = await getFirebaseHistory();
        res.json({ success: true, signals });
    } catch (e: any) {
        res.status(500).json({ success: false, error: e.message });
    }
});

apiRouter.post('/telegram/test', rateLimiter(5), async (req, res) => {
    const { botToken, chatId } = req.body;
    if (!botToken || !chatId || typeof botToken !== 'string' || typeof chatId !== 'string') {
        res.status(400).json({ success: false, error: 'Missing or invalid token or chat ID' });
        return;
    }
    
    try {
        await testTelegramConnection(botToken.trim(), chatId.trim());
        addLog('Telegram test message sent successfully.', 'info');
        res.json({ success: true });
    } catch (error: any) {
        addLog(`Telegram test error: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
    }
});
