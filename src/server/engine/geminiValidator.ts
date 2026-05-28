import { GoogleGenAI, Type, Schema } from '@google/genai';
import { globalState, addLog } from '../state.js';
import { sendTelegramAlert } from '../telegram.js';
import { z } from 'zod';

const GeminiResponseSchema = z.object({
    status: z.string(),
    signal: z.enum(['BUY', 'SELL', 'WAIT']),
    valid: z.boolean(),
    confidence: z.number().min(0).max(100),
    anomalies: z.array(z.string()).optional(),
    reason: z.string()
});

export async function validateWithGeminiStrict(price: number, direction: 'BUY' | 'SELL', entryPrice: number, currentAtr: number): Promise<z.infer<typeof GeminiResponseSchema>> {
  const apiKey = globalState.settings.geminiApiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) return { status: 'SCANNING', signal: 'WAIT', valid: false, confidence: 0, reason: 'No Gemini API Key', anomalies: [] };
  
  const ai = new GoogleGenAI({ apiKey });
  const maxRetries = 2;
  const retryDelay = 3000;

  const modeContext = globalState.settings.mode || 'AGGRESSIVE';

  const prompt = `You are an institutional XAUUSD validator.
Your ONLY role is confidence validation and anomaly detection. 
DO NOT generate buy/sell signals. The algorithmic engine has already structured the trade.
Review the trade context below and determine if there are market anomalies or reasons to lack confidence.

Active Mode: ${modeContext}
Direction: ${direction}
Potential Entry: ${entryPrice.toFixed(3)}
Current Price: ${price.toFixed(3)}
ATR (15M): ${currentAtr.toFixed(2)}

Evaluate strictly. Output high confidence only if the structure makes sense. Identify any anomalies like choppy price action or low volume traps.`;

  const responseSchema: Schema = {
    type: Type.OBJECT,
    properties: {
        status: { type: Type.STRING },
        signal: { type: Type.STRING, description: "Must match the input direction or WAIT" },
        valid: { type: Type.BOOLEAN, description: "True if confidence > 65 and no severe anomalies" },
        confidence: { type: Type.NUMBER },
        anomalies: { type: Type.ARRAY, items: { type: Type.STRING } },
        reason: { type: Type.STRING }
    },
    required: ["status", "signal", "valid", "confidence", "reason"]
  };

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
          config: {
              responseMimeType: 'application/json',
              responseSchema: responseSchema,
              temperature: 0.1
          }
      });
      const text = response.text || '{}';
      const parsedObj = JSON.parse(text);
      
      const result = GeminiResponseSchema.safeParse(parsedObj);
      if (result.success) {
          return result.data;
      } else {
          addLog(`Gemini strict validation failed: ${result.error.message}`, 'warn');
          return { status: 'REJECTED', signal: 'WAIT', valid: false, confidence: 0, reason: 'Zod Parse Failed', anomalies: [] };
      }

    } catch (error: any) {
      const errMsg = error?.message || '';
      if (errMsg.includes('429') || errMsg.toUpperCase().includes('QUOTA') || errMsg.includes('TOO_MANY_REQUESTS')) {
          addLog(`[CRITICAL] AI Studio Quota Exceeded!`, 'error');
          sendTelegramAlert(`AI Studio API Quota exhausted.\nError: ${errMsg}`).catch(()=>{});
          return { status: 'REJECTED', signal: 'WAIT', valid: false, confidence: 0, reason: 'Quota Exceeded', anomalies: [] };
      }
      if (attempt <= maxRetries) {
        addLog(`Gemini error (${errMsg}), retrying...`, 'warn');
        await new Promise(res => setTimeout(res, retryDelay));
      } else {
        return { status: 'REJECTED', signal: 'WAIT', valid: false, confidence: 0, reason: 'API Error', anomalies: [] };
      }
    }
  }
  return { status: 'REJECTED', signal: 'WAIT', valid: false, confidence: 0, reason: 'API Error', anomalies: [] };
}
