import { globalState, addLog } from './state.js';
import { Signal } from '../types.js';

export async function sendTelegramSignal(signal: Signal) {
    const { telegramBotToken, telegramChatId } = globalState.settings;
    if (!telegramBotToken || !telegramChatId) return;

    const text = `🚨 XAUUSD ${signal.direction} 🚨\nEntry: ${signal.entry.toFixed(3)}\nSL: ${signal.sl.toFixed(3)}\nTP1: ${signal.tp1.toFixed(3)}\nTP2: ${signal.tp2.toFixed(3)}\nTP3: ${signal.tp3.toFixed(3)}\nRR: ${signal.rr.toFixed(1)}\nTimeframe: MTF (H1, M15, M5)\nReason: ${signal.reason}\nConfidence: ${signal.confidence}%\nTimestamp: ${new Date(signal.timestamp).toLocaleString('id-ID', { timeZone: 'Asia/Makassar' })} WITA`;

    try {
        await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ chat_id: telegramChatId, text })
        });
        addLog(`Sent signal to Telegram: ${signal.direction}`);
    } catch (e: any) {
        addLog(`Telegram error: ${e.message}`, 'error');
    }
}

export async function sendTelegramAlert(message: string) {
    const { telegramBotToken, telegramChatId } = globalState.settings;
    if (!telegramBotToken || !telegramChatId) return;

    const text = `⚠️ SYSTEM ALERT ⚠️\n\n${message}\n\nTime: ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Makassar' })} WITA`;
    try {
        await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ chat_id: telegramChatId, text })
        });
    } catch (e: any) {
        console.error("Alert send failed:", e);
        addLog(`Telegram alert error: ${e.message || 'Unknown error'}`, 'error');
    }
}

export async function testTelegramConnection(botToken: string, chatId: string): Promise<boolean> {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ chat_id: chatId, text: '🧪 XAUUSD SMC Test Signal\nConnection to Telegram is working!' })
    });
    
    if (!response.ok) {
        const err = await response.text();
        throw new Error(err);
    }
    return true;
}
