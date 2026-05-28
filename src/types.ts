export interface AppSettings {
  twelveDataApiKey: string;
  geminiApiKey: string;
  telegramBotToken: string;
  telegramChatId: string;
  autoSwitchFallback: boolean;
  mockProbability: number;
  mode: 'AGGRESSIVE' | 'CONSERVATIVE';
}

export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface RiskStats {
  dailyLoss: number;
  consecutiveLosses: number;
  drawdownLock: boolean;
  tradesToday: number;
  lastTradeTime: number;
}

export interface BacktestStats {
  totalTrades: number;
  wins: number;
  losses: number;
  breakevens: number;
  winRate: number;
  avgRR: number;
  maxDrawdown: number;
}

export interface TradeState {
  id: string;
  entryPrice: number;
  currentSL: number;
  tp1: number;
  tp2: number;
  tp3: number;
  direction: 'BUY' | 'SELL';
  status: 'ACTIVE' | 'PARTIAL_1' | 'PARTIAL_2' | 'BREAKEVEN' | 'TRAILING' | 'CLOSED';
  size: number;
  highestPnL: number;
}

export interface Signal {
  id: string;
  timestamp: number;
  pair: string;
  direction: 'BUY' | 'SELL';
  entry: number;
  sl: number;
  tp1: number;
  tp2: number;
  tp3: number;
  rr: number;
  reason: string;
  confidence: number;
  status: 'PENDING' | 'ACTIVE' | 'CLOSED' | 'SCANNING' | 'SETUP_FOUND' | 'WAITING_RETEST' | 'LIMIT_PLACED' | 'TP_HIT' | 'SL_HIT' | 'EXPIRED' | 'PARTIAL_TP' | 'BREAKEVEN_HIT';
  result?: 'WIN' | 'LOSS' | 'BREAKEVEN';
  firebaseId?: string;
  mode: 'AGGRESSIVE' | 'CONSERVATIVE';
}

export interface SmcState {
  step: 'WAITING' | 'SWEEP_DETECTED' | 'BOS_CONFIRMED' | 'FVG_FOUND' | 'MITIGATION_WAIT' | 'ENTRY_READY' | 'ENTRY_TRIGGERED' | 'TRADE_ACTIVE' | 'PARTIAL_EXIT' | 'BREAKEVEN' | 'TRAILING' | 'INVALIDATED' | 'COOLDOWN';
  currentH1Bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  currentM15Trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  activeSetup: 'BUY' | 'SELL' | null;
  sweepPrice: number | null;
  bosPrice: number | null;
  fvgZone: { top: number, bottom: number } | null;
  obZone: { top: number, bottom: number } | null;
  recentHigh: number | null;
  recentLow: number | null;
  equalHighsSwept?: boolean;
  equalLowsSwept?: boolean;
  bosScore?: number;
  fvgScore?: number;
  aiConfidence?: number;
  activeTrade?: TradeState | null;
}

export interface ServerState {
  price: number | null;
  status: 'CONNECTING' | 'LIVE' | 'ERROR' | 'FALLBACK';
  lastConnectTime: number | null;
  lastTickTime?: number;
  logs: LogEntry[];
  signals: Signal[];
  settings: AppSettings;
  smcState?: SmcState;
  riskStats?: RiskStats;
  backtestStats?: BacktestStats;
}

export interface LogEntry {
  id: string;
  timestamp: number;
  message: string;
  level: 'info' | 'warn' | 'error';
}

