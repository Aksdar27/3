import { useState, useEffect } from 'react';
import { Signal, SmcState, AppSettings, RiskStats } from '../types';

export default function Home({ signals, smcState, status, lastTickTime, settings, riskStats }: { signals: Signal[], smcState?: SmcState, status?: string, lastTickTime?: number, settings?: AppSettings, riskStats?: RiskStats }) {
  const recentSignals = signals.slice(0, 5);
  const [now, setNow] = useState(Date.now());
  
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const isScannerActive = status === 'LIVE' && smcState?.recentHigh && smcState?.recentLow && lastTickTime && (now - lastTickTime < 10000);
  const isTelegramActive = !!settings?.telegramBotToken && !!settings?.telegramChatId;

  const closedSignals = signals.filter(s => s.status === 'CLOSED');
  const wins = closedSignals.filter(s => s.result === 'WIN').length;
  const losses = closedSignals.filter(s => s.result === 'LOSS').length;
  const breakEvens = closedSignals.filter(s => s.result === 'BREAKEVEN').length;
  const winRate = closedSignals.length > 0 ? (wins / (wins + losses) * 100).toFixed(1) : '---';

  return (
    <div className="p-4 space-y-6">
      
      {/* Risk Engine Alert */}
      {riskStats?.drawdownLock && (
        <div className="bg-rose-500/10 border border-rose-500 rounded-xl p-3 flex flex-col items-center justify-center text-rose-400 font-bold shadow-[0_0_15px_rgba(244,63,94,0.2)]">
            <span className="text-sm uppercase tracking-widest">Drawdown Lock Engaged</span>
            <span className="text-[10px] text-rose-500 mt-1">Trading paused to protect capital.</span>
        </div>
      )}

      {/* Stats Bar */}
      <div className="flex gap-2 w-full">
        <div className="flex-1 bg-gradient-to-br from-[#0D1016] to-slate-900 border border-slate-800 rounded-xl p-3 shadow-lg flex flex-col justify-center items-center">
            <span className="text-[10px] text-slate-500 font-bold tracking-widest uppercase mb-1">Win Rate</span>
            <span className="text-xl font-mono text-emerald-400">{winRate}%</span>
        </div>
        <div className="flex-1 bg-gradient-to-br from-[#0D1016] to-slate-900 border border-slate-800 rounded-xl p-3 shadow-lg flex flex-col justify-center items-center">
            <span className="text-[10px] text-slate-500 font-bold tracking-widest uppercase mb-1">Trades</span>
            <div className="flex items-center text-[10px] space-x-2 font-mono font-bold mt-1">
                <span className="text-emerald-500">{wins}W</span>
                <span className="text-slate-500">{breakEvens}BE</span>
                <span className="text-rose-500">{losses}L</span>
            </div>
        </div>
        <div className="flex-1 bg-gradient-to-br from-[#0D1016] to-slate-900 border border-slate-800 rounded-xl p-3 shadow-lg flex flex-col justify-center items-center">
            <span className="text-[10px] text-slate-500 font-bold tracking-widest uppercase mb-1">Risk</span>
            <div className="mt-1 flex flex-col items-center">
                <span className={`text-xs font-mono font-bold ${riskStats?.consecutiveLosses && riskStats.consecutiveLosses > 1 ? 'text-amber-500' : 'text-slate-300'}`}>{riskStats?.consecutiveLosses || 0} SL Streak</span>
            </div>
        </div>
      </div>
      
      {/* Market Structure & Detection */}
      <div className="grid grid-cols-2 gap-4">
        {/* Market Structure */}
        <section className="bg-[#0D1016] border border-slate-800 rounded-xl p-4 shadow-lg">
          <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-3">Market Structure</h3>
          <div className="space-y-2">
            <div className="flex justify-between items-center p-2 rounded bg-slate-900/50 border border-slate-800">
              <span className="text-[10px] text-slate-400">Current M15</span>
              <span className={`text-xs font-mono font-bold ${smcState?.currentM15Trend === 'BULLISH' ? 'text-emerald-400' : smcState?.currentM15Trend === 'BEARISH' ? 'text-rose-400' : 'text-slate-400'}`}>{smcState?.currentM15Trend || '---'}</span>
            </div>
            <div className="flex justify-between items-center p-2 rounded bg-slate-900/50 border border-slate-800">
              <span className="text-[10px] text-slate-400">Recent High</span>
              <span className="text-xs font-mono text-white">{smcState?.recentHigh?.toFixed(2) || '---.--'}</span>
            </div>
            <div className="flex justify-between items-center p-2 rounded bg-slate-900/50 border border-slate-800">
              <span className="text-[10px] text-slate-400">Recent Low</span>
              <span className="text-xs font-mono text-white">{smcState?.recentLow?.toFixed(2) || '---.--'}</span>
            </div>
          </div>
        </section>

        {/* SMC Detection */}
        <section className="bg-[#0D1016] border border-slate-800 rounded-xl p-4 shadow-lg flex flex-col justify-between">
          <div>
             <div className="flex justify-between items-center mb-3 text-[11px] font-bold uppercase tracking-widest text-slate-500">
               <h3>SMC Engine</h3>
               <span className={`px-1.5 py-0.5 rounded text-[9px] ${settings?.mode === 'CONSERVATIVE' ? 'bg-blue-500/10 text-blue-400' : 'bg-rose-500/10 text-rose-400'}`}>
                 MODE: {settings?.mode || 'AGGRESSIVE'}
               </span>
             </div>

             <div className="text-xs font-bold text-slate-300 mb-2 truncate">
               Step: <span className="text-amber-400 font-mono text-[10px]">{smcState?.step.replace('WAITING_', '') || '---'}</span>
             </div>
             {smcState?.sweepPrice && (
               <div className="text-[10px] text-slate-400 truncate">
                 Sweep: <span className="text-white font-mono">{smcState.sweepPrice.toFixed(2)}</span> ({smcState.activeSetup})
               </div>
             )}
             {smcState?.bosPrice && (
               <div className="text-[10px] text-slate-400 truncate mt-1">
                 BOS: <span className="text-emerald-400 font-mono">{smcState.bosPrice.toFixed(2)}</span>
               </div>
             )}
             {smcState?.fvgZone && (
               <div className="text-[10px] text-slate-400 truncate mt-1">
                 FVG Z: <span className="text-blue-400 font-mono">{smcState.fvgZone.bottom.toFixed(2)}-{smcState.fvgZone.top.toFixed(2)}</span>
               </div>
             )}
          </div>
          <div className="mt-2 text-[9px] uppercase tracking-wider text-slate-500 flex items-center justify-center p-1.5 bg-slate-900 rounded border border-slate-800 border-dashed">
            {smcState?.step === 'ENTRY_READY' ? (
              <span className="text-purple-400 animate-pulse font-bold">Calling Gemini Validator...</span>
            ) : (
              <span>Scanning Price Action</span>
            )}
          </div>
        </section>
      </div>

      <div>
        <div className="flex justify-between items-center mb-4 px-2">
          <h2 className="text-sm font-bold text-white flex items-center">
            <span className="w-2 h-2 rounded-full bg-amber-500 mr-2"></span>
            RECENT SIGNALS
          </h2>
          <div className="flex space-x-2">
            <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">TOTAL: {signals.length}</span>
          </div>
        </div>
        
        {recentSignals.length === 0 ? (
          <div className="text-center py-10 text-slate-500 font-mono text-sm bg-[#0D1016] rounded-xl border border-slate-800 flex flex-col items-center justify-center min-h-[120px]">
            {isScannerActive ? (
              <div className="flex flex-col items-center space-y-3">
                <div className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]"></span>
                </div>
                <span className="text-emerald-500/90 font-bold uppercase tracking-widest text-[10px]">Realtime Scanner Active</span>
              </div>
            ) : (
              "Waiting for setups..."
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {recentSignals.map(signal => (
              <SignalCard key={signal.id} signal={signal} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function SignalCard({ signal, key }: { signal: Signal, key?: string | number }) {
  const isBuy = signal.direction === 'BUY';
  let badgeColor = 'bg-slate-700 text-slate-300';
  if (signal.status === 'PENDING' || signal.status === 'WAITING_RETEST' || signal.status === 'LIMIT_PLACED' || signal.status === 'SETUP_FOUND' || signal.status === 'SCANNING') badgeColor = isBuy ? 'bg-emerald-500 text-slate-950' : 'bg-rose-500 text-white';
  else if (signal.status === 'ACTIVE') badgeColor = 'bg-blue-500 text-white animate-pulse';
  else if (signal.status === 'CLOSED' || signal.status === 'TP_HIT' || signal.status === 'SL_HIT' || signal.status === 'EXPIRED') {
      if (signal.status === 'TP_HIT' || signal.result === 'WIN') badgeColor = 'bg-emerald-600 text-white border border-emerald-400';
      else if (signal.status === 'SL_HIT' || signal.result === 'LOSS') badgeColor = 'bg-rose-600 text-white border border-rose-400';
      else badgeColor = 'bg-slate-600 text-white border border-slate-400';
  }

  return (
    <div className={`p-4 rounded-xl bg-gradient-to-r from-slate-900 to-slate-800 border-l-4 shadow-lg ${isBuy ? 'border-l-emerald-500' : 'border-l-rose-500'} transition-all`}>
      <div className="flex justify-between items-start mb-3 border-b border-slate-800/50 pb-3">
        <div className="flex items-center space-x-3">
          <div className="flex flex-col">
            <span className={`px-2 py-1 text-[10px] font-bold rounded uppercase tracking-wider mb-1 inline-block text-center ${badgeColor}`}>
              {signal.direction} {signal.status === 'CLOSED' && signal.result ? signal.result : signal.status}
            </span>
            {signal.mode && (
              <span className={`px-1.5 py-0.5 text-[8px] font-bold rounded bg-slate-900 border text-center ${signal.mode === 'CONSERVATIVE' ? 'text-blue-400 border-blue-500/20' : 'text-rose-400 border-rose-500/20'}`}>
                {signal.mode}
              </span>
            )}
          </div>
          <span className="text-sm font-mono font-bold text-white shrink-0">{signal.pair}</span>
        </div>
        <div className="text-right">
          <span className="text-[10px] text-slate-500 font-mono block">
            {new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Makassar', hour: '2-digit', minute:'2-digit', second:'2-digit', day: '2-digit', month: 'short' }).format(new Date(signal.timestamp))} (WITA)
          </span>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2 mb-3">
        <div>
          <div className="text-[9px] uppercase text-slate-500 tracking-wider mb-0.5">Entry</div>
          <div className="text-xs font-mono text-white font-bold">{signal.entry.toFixed(2)}</div>
        </div>
        <div>
           <div className="text-[9px] uppercase text-slate-500 tracking-wider mb-0.5">SL</div>
           <div className="text-xs font-mono text-rose-400">{signal.sl.toFixed(2)}</div>
        </div>
        <div>
           <div className="text-[9px] uppercase text-slate-500 tracking-wider mb-0.5">TP1</div>
           <div className="text-xs font-mono text-emerald-300">{signal.tp1.toFixed(2)}</div>
        </div>
        <div>
           <div className="text-[9px] uppercase text-slate-500 tracking-wider mb-0.5">TP2</div>
           <div className="text-xs font-mono text-emerald-500">{signal.tp2.toFixed(2)}</div>
        </div>
      </div>
      <div className="text-[9px] text-slate-400 border-t border-slate-800/50 pt-2 flex justify-between items-center bg-slate-900/30 rounded -mx-2 px-2 pb-1.5 mt-1">
        <span className="truncate pr-2 italic opacity-80">"{signal.reason}"</span>
        <div className="flex gap-2">
            <span className={`shrink-0 font-bold px-1.5 py-0.5 rounded ${signal.confidence >= 90 ? 'text-purple-400 bg-purple-500/10' : signal.confidence >= 80 ? 'text-cyan-400 bg-cyan-500/10' : 'text-amber-400 bg-amber-500/10'}`}>CONF {signal.confidence}%</span>
            <span className="shrink-0 text-amber-500 font-bold bg-amber-500/10 px-1.5 py-0.5 rounded">RR {signal.rr.toFixed(1)}</span>
        </div>
      </div>
    </div>
  );
}
