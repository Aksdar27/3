import { GoogleGenAI } from '@google/genai';
import { globalState, addLog } from './state.js';
import { sendTelegramAlert } from './telegram.js';

export async function validateWithGemini(price: number, direction: 'BUY' | 'SELL', entryPrice: number, currentAtr: number) {
  const apiKey = globalState.settings.geminiApiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) return { signal: 'WAIT', confidence: 0, reason: 'No Gemini API Key' };
  
  const ai = new GoogleGenAI({ apiKey });
  const maxRetries = 2;
  const retryDelay = 3000;

  const prompt = `You are a real XAUUSD HIGH WIN-RATE SMC SCALPING ENGINE. Focus on accuracy (50%-70% target win rate).
The user has selected mode: ${globalState.settings.mode || 'AGGRESSIVE'}. Only evaluate against the selected mode.

MODE 1 — AGGRESSIVE SCALPING (Momentum)
Trend timeframe: M5. Setup timeframe: M1.
Flow: 1. Detect clear liquidity sweep (BSL/SSL). 2. Detect strong displacement and CHOCH. 3. Detect clear FVG. 4. Wait for retest. 5. Enter on rejection.
Rules: High frequency. Risk: Max RR 1:1.5 to 1:2 for higher win rate. Stoploss: SMC structure + 0.5 ATR buffer to avoid stop hunt.

MODE 2 — CONSERVATIVE SCALPING (High Probability)
Trend timeframe: M15/H1. Setup timeframe: M5. Entry timeframe: M1.
Flow: 1. Strict alignment with M15 trend. 2. Price sweeps significant M15 liquidity. 3. Strong M5 CHOCH with displacement. 4. Retest into premium/discount OB/FVG. 5. M1 candlestick confirmation (Engulfing/Pinbar).
Rules: Low frequency, high accuracy. Risk: RR 1:1.5 to 1:2 for higher win rate. Stoploss: SMC structure + 0.5 ATR buffer to avoid stop hunt.

Debug reasons must be exact if rejected (e.g., "invalid sweep", "invalid BOS", "invalid retest", "RR too high for high win-rate target", "ATR filter failed").
Only active during London & New York sessions.

Current Setup Context:
Active Mode: ${globalState.settings.mode || 'AGGRESSIVE'}
Direction: ${direction}
Potential Entry: ${entryPrice.toFixed(3)}
Current Price: ${price.toFixed(3)}
ATR: ${currentAtr.toFixed(2)}.

Always respond in strictly JSON format matching this schema with no markdown formatting, just plain text JSON:
{
  "status": "SCANNING" | "SETUP_FOUND" | "WAITING_RETEST" | "LIMIT_PLACED" | "ACTIVE" | "TP_HIT" | "SL_HIT" | "EXPIRED",
  "signal": "BUY" | "SELL" | "WAIT",
  "mode": "AGGRESSIVE" | "CONSERVATIVE",
  "entry": number,
  "sl": number,
  "tp1": number,
  "tp2": number,
  "tp3": number,
  "rr": number,
  "confidence": number,
  "liquiditySweep": boolean,
  "bos": boolean,
  "choch": boolean,
  "ob": boolean,
  "fvg": boolean,
  "retest": boolean,
  "valid": boolean,
  "reason": string
}`;

  let isQuotaExceeded = false;
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
      });
      const text = response.text || '';
      if (text) {
          const match = text.match(/\{[\s\S]*\}/);
          if (match) {
              return JSON.parse(match[0]);
          }
      }
      return { signal: 'WAIT', confidence: 0, reason: 'Parse error' };
    } catch (error: any) {
      const errMsg = error?.message || '';
      if (errMsg.includes('429') || errMsg.toUpperCase().includes('QUOTA') || errMsg.includes('TOO_MANY_REQUESTS')) {
          addLog(`[CRITICAL] AI Studio (Gemini) Quota Exceeded or Rate Limited!`, 'error');
          sendTelegramAlert(`AI Studio (Gemini) API Quota exhausted or rate limited.\n\nError: ${errMsg}`);
          isQuotaExceeded = true;
          return { signal: 'WAIT', confidence: 0, reason: 'Quota Exceeded' };
      }
      if (attempt <= maxRetries) {
        addLog(`Gemini error (${errMsg}), retrying in 3s (Attempt ${attempt}/${maxRetries})...`, 'warn');
        await new Promise(res => setTimeout(res, retryDelay));
      } else {
        addLog(`[WARN] Gemini validation failed, continuing scanner safely`, 'warn');
        return { signal: 'WAIT', confidence: 0, reason: 'API Error' };
      }
    }
  }
  return { signal: 'WAIT', confidence: 0, reason: 'API Error' };
}
