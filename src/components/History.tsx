import { useState, useEffect } from 'react';
import { Signal } from '../types';
import { SignalCard } from './Home';

export default function History({ signals }: { signals: Signal[] }) {
  const [historySignals, setHistorySignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
     fetch('/api/history')
        .then(res => res.json())
        .then(data => {
            if (data.success && data.signals) {
                setHistorySignals(data.signals);
            }
            setLoading(false);
        })
        .catch(err => {
            console.error('Failed to fetch history', err);
            setLoading(false);
        });
  }, []);

  const displaySignals = historySignals.length > 0 ? historySignals : signals;

  return (
    <div className="p-4 space-y-4">
      <div className="flex justify-between items-center px-2">
        <h2 className="text-sm font-bold text-white flex items-center">
          <span className="w-2 h-2 rounded-full bg-amber-500 mr-2"></span>
          SIGNAL HISTORY
        </h2>
        <div className="flex space-x-2">
           <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">ALL: {displaySignals.length}</span>
        </div>
      </div>
      
      {loading ? (
        <div className="text-center py-10 text-slate-500 font-mono text-[10px] uppercase tracking-widest bg-[#0D1016] rounded-xl border border-slate-800 animate-pulse">
          Loading history...
        </div>
      ) : displaySignals.length === 0 ? (
        <div className="text-center py-10 text-slate-500 font-mono text-[10px] uppercase tracking-widest bg-[#0D1016] rounded-xl border border-slate-800">
          No historical database signals yet.
        </div>
      ) : (
        <div className="space-y-3">
          {displaySignals.map(signal => <SignalCard key={signal.id || signal.firebaseId || Math.random()} signal={signal} />)}
        </div>
      )}
    </div>
  );
}
