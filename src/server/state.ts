import fs from 'fs/promises';
import path from 'path';
import { AppSettings, ServerState, LogEntry } from '../types.js';
import { addFirebaseLog, saveStateToFirebase, restoreStateFromFirebase } from './db.js';

export const SETTINGS_FILE = path.join(process.cwd(), 'settings.json');
export const PERSIST_FILE = path.join(process.cwd(), 'persist.json');

export const globalState: ServerState = {
  price: null,
  status: 'CONNECTING',
  lastConnectTime: null,
  lastTickTime: 0,
  logs: [],
  signals: [],
  settings: {
    twelveDataApiKey: '',
    geminiApiKey: '',
    telegramBotToken: '',
    telegramChatId: '',
    autoSwitchFallback: true,
    mockProbability: 1.0,
    mode: 'AGGRESSIVE'
  }
};

export const SSE_CLIENTS = new Set<any>();

export function addLog(message: string, level: 'info'|'warn'|'error' = 'info') {
  const log: LogEntry = { id: Date.now().toString() + Math.random(), timestamp: Date.now(), message, level };
  globalState.logs.unshift(log);
  if (globalState.logs.length > 200) globalState.logs.pop();
  broadcastState();

  addFirebaseLog(message, level, log.timestamp);
}

export function broadcastState() {
  const safeState = { ...globalState, settings: { ...globalState.settings } };
  
  if (safeState.settings.twelveDataApiKey) safeState.settings.twelveDataApiKey = '***';
  if (safeState.settings.geminiApiKey) safeState.settings.geminiApiKey = '***';
  if (safeState.settings.telegramBotToken) safeState.settings.telegramBotToken = '***';

  const data = JSON.stringify(safeState);
  for (const client of SSE_CLIENTS) {
    try {
        client.write(`data: ${data}\n\n`);
    } catch (e) {
        SSE_CLIENTS.delete(client);
    }
  }
}

export async function saveEngineState() {
    try {
        const persistData = {
            signals: globalState.signals.slice(0, 50),
            smcState: globalState.smcState,
            riskStats: globalState.riskStats
        };
        await fs.writeFile(PERSIST_FILE, JSON.stringify(persistData, null, 2));
        await saveStateToFirebase(persistData);
    } catch (e) {
        // ignore
    }
}

export async function loadEngineState() {
    try {
        let parsed: any = null;
        try {
            const data = await fs.readFile(PERSIST_FILE, 'utf8');
            parsed = JSON.parse(data);
        } catch(e) {
            // disk failed, try firebase
            parsed = await restoreStateFromFirebase();
        }
        
        if (parsed) {
            if (parsed.signals) globalState.signals = parsed.signals;
            if (parsed.smcState) globalState.smcState = parsed.smcState;
            if (parsed.riskStats) globalState.riskStats = parsed.riskStats;
            addLog('Engine state recovered from persistence (disk/firebase).');
        }
    } catch (e: any) {
        addLog(`Failed to load engine state: ${e.message}`, 'error');
    }
}

export async function loadSettings() {
  try {
    const data = await fs.readFile(SETTINGS_FILE, 'utf8');
    const parsed = JSON.parse(data);
    globalState.settings = { ...globalState.settings, ...parsed };
    addLog('Settings loaded successfully.');
  } catch (err: any) {
    if (err.code !== 'ENOENT') {
      addLog(`Failed to load settings: ${err.message}`, 'error');
    }
  }

  const envKeys = Object.keys(process.env);
  
  const twelveKey = envKeys.find(k => k.toUpperCase() === 'TWELVEDATA_API_KEY' || k.toUpperCase() === 'TWELVE_DATA_API_KEY') || 'TWELVEDATA_API_KEY';
  if (process.env[twelveKey]) {
      globalState.settings.twelveDataApiKey = process.env[twelveKey]!;
      console.log("[ENV] Detected TWELVEDATA API KEY from environment.");
      addLog("Loaded TwelveData API Key from Environment", "info");
  }
  
  const geminiKey = envKeys.find(k => k.toUpperCase() === 'GEMINI_API_KEY') || 'GEMINI_API_KEY';
  if (process.env[geminiKey]) {
      globalState.settings.geminiApiKey = process.env[geminiKey]!;
      console.log("[ENV] Detected GEMINI API KEY from environment.");
      addLog("Loaded Gemini API Key from Environment", "info");
  }
  
  const teleBotKey = envKeys.find(k => k.toUpperCase() === 'TELEGRAM_BOT_TOKEN') || 'TELEGRAM_BOT_TOKEN';
  if (process.env[teleBotKey]) {
      globalState.settings.telegramBotToken = process.env[teleBotKey]!;
      console.log("[ENV] Detected TELEGRAM BOT TOKEN from environment.");
      addLog("Loaded Telegram Bot Token from Environment", "info");
  }
  
  const teleChatKey = envKeys.find(k => k.toUpperCase() === 'TELEGRAM_CHAT_ID') || 'TELEGRAM_CHAT_ID';
  if (process.env[teleChatKey]) {
      globalState.settings.telegramChatId = process.env[teleChatKey]!;
      console.log("[ENV] Detected TELEGRAM CHAT ID from environment.");
  }

  if (process.env.FIREBASE_PROJECT_ID) {
      console.log("[ENV] Detected FIREBASE config from environment.");
      addLog("Loaded Firebase config from Environment", "info");
  }
}

export async function saveSettings(settings: AppSettings, onSettingsSaved?: () => void) {
  try {
    const previousSettings = { ...globalState.settings };
    
    if (settings.twelveDataApiKey === '***') settings.twelveDataApiKey = previousSettings.twelveDataApiKey;
    if (settings.geminiApiKey === '***') settings.geminiApiKey = previousSettings.geminiApiKey;
    if (settings.telegramBotToken === '***') settings.telegramBotToken = previousSettings.telegramBotToken;

    globalState.settings = { ...globalState.settings, ...settings };
    
    await fs.writeFile(SETTINGS_FILE, JSON.stringify(globalState.settings, null, 2));
    addLog('Settings saved. Restarting connections if needed...');
    if (onSettingsSaved) onSettingsSaved();
  } catch (err: any) {
    addLog(`Failed to save settings: ${err.message}`, 'error');
  }
}
