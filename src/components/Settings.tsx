import React, { useState, useEffect } from 'react';
import { AppSettings } from '../types';

export default function Settings({ current, onSave }: { current?: AppSettings, onSave: (s: AppSettings) => Promise<void> }) {
  const [form, setForm] = useState<AppSettings>(current || {
    twelveDataApiKey: '',
    geminiApiKey: '',
    telegramBotToken: '',
    telegramChatId: '',
    autoSwitchFallback: true,
    mockProbability: 1.0,
    mode: 'AGGRESSIVE'
  });
  const [saving, setSaving] = useState(false);
  const [isInitialized, setIsInitialized] = useState(!!current);
  const [testingTelegram, setTestingTelegram] = useState(false);
  const [testResult, setTestResult] = useState<{success: boolean, message: string} | null>(null);

  useEffect(() => {
    if (current && !isInitialized) {
      setForm(current);
      setIsInitialized(true);
    }
  }, [current, isInitialized]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await onSave(form);
    setTimeout(() => setSaving(false), 500);
  };

  const handleTestTelegram = async () => {
    if (!form.telegramBotToken || !form.telegramChatId) {
       setTestResult({ success: false, message: 'Bot Token and Chat ID required' });
       return;
    }
    setTestingTelegram(true);
    setTestResult(null);
    try {
       const res = await fetch('/api/telegram/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ botToken: form.telegramBotToken, chatId: form.telegramChatId })
       });
       const data = await res.json();
       if (data.success) {
          setTestResult({ success: true, message: 'Message sent!' });
       } else {
          setTestResult({ success: false, message: data.error || 'Test failed' });
       }
    } catch (e: any) {
       setTestResult({ success: false, message: 'Network error' });
    }
    setTestingTelegram(false);
  };

  return (
    <div className="p-4 pb-12">
      <div className="flex items-center mb-6 px-2">
        <h2 className="text-sm font-bold text-white flex items-center">
          <span className="w-2 h-2 rounded-full bg-amber-500 mr-2"></span>
          CONFIGURATION
        </h2>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        
        <Section title="Data Source">
           <Label>TwelveData API Key</Label>
           <Input 
             type="password" 
             value={form.twelveDataApiKey} 
             onChange={e => setForm({...form, twelveDataApiKey: e.target.value})} 
             placeholder="wss://ws.twelvedata.com/..." 
           />
           <div className="flex items-center gap-2 mt-3 p-2.5 bg-slate-900/50 border border-slate-800 rounded">
             <input 
               type="checkbox" 
               checked={form.autoSwitchFallback}
               onChange={e => setForm({...form, autoSwitchFallback: e.target.checked})}
               id="autoSwitch" 
               className="w-4 h-4 accent-amber-500 rounded border-slate-700 bg-slate-950"
             />
             <label htmlFor="autoSwitch" className="text-xs text-slate-400">Auto-fallback to Yahoo Finance on WS 429</label>
           </div>
        </Section>

        <Section title="Strategy Mode">
           <Label>Execution Mode</Label>
           <div className="flex space-x-2 mt-2">
             <button
               type="button"
               onClick={() => setForm({...form, mode: 'AGGRESSIVE'})}
               className={`flex-1 py-2 px-3 rounded text-xs font-bold border transition-colors ${form.mode === 'AGGRESSIVE' ? 'bg-rose-500/10 border-rose-500/50 text-rose-500' : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-300'}`}
             >
               AGGRESSIVE SCALPING
             </button>
             <button
               type="button"
               onClick={() => setForm({...form, mode: 'CONSERVATIVE'})}
               className={`flex-1 py-2 px-3 rounded text-xs font-bold border transition-colors ${form.mode === 'CONSERVATIVE' ? 'bg-blue-500/10 border-blue-500/50 text-blue-500' : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-300'}`}
             >
               CONSERVATIVE SCALPING
             </button>
           </div>
           <p className="text-[10px] text-slate-500 mt-3 leading-relaxed">
             {form.mode === 'AGGRESSIVE' ? 'Mode 1: Fast M1 execution, instant entry on retest. Prioritizes frequency.' : 'Mode 2: Higher accuracy, M15 trend alignment, requires strict M1 candlestick confirmation.'}
           </p>
        </Section>

        <Section title="Detection Sensitivity">
           <Label>Signal Probability Rate: {form.mockProbability.toFixed(1)}x</Label>
           <div className="mt-2 text-xs text-slate-500 mb-2 leading-relaxed">
             Adjusts the frequency of finding SMC patterns (for prototype/testing). 
             Higher means more frequent testing signals.
           </div>
           <input 
             type="range" 
             min="0" max="5" step="0.1"
             value={form.mockProbability} 
             onChange={e => setForm({...form, mockProbability: parseFloat(e.target.value)})} 
             className="w-full accent-amber-500"
           />
        </Section>

        <Section title="AI Validation">
           <Label>Gemini API Key (Leave blank to use ENV)</Label>
           <Input 
             type="password" 
             value={form.geminiApiKey} 
             onChange={e => setForm({...form, geminiApiKey: e.target.value})} 
           />
        </Section>

        <Section title="Telegram Delivery">
           <Label>Bot Token</Label>
           <Input 
             type="password" 
             value={form.telegramBotToken} 
             onChange={e => setForm({...form, telegramBotToken: e.target.value})} 
           />
           <Label className="mt-3">Chat ID</Label>
           <Input 
             type="text" 
             value={form.telegramChatId} 
             onChange={e => setForm({...form, telegramChatId: e.target.value})} 
           />
           <div className="mt-3 flex items-center justify-between">
             <button 
                type="button" 
                onClick={handleTestTelegram}
                disabled={testingTelegram}
                className="px-3 py-1.5 bg-slate-900 border border-slate-700 hover:bg-slate-800 rounded text-xs font-bold text-slate-300 disabled:opacity-50 transition-colors"
             >
                {testingTelegram ? 'Testing...' : 'Test Connection'}
             </button>
             {testResult && (
                <div className={`text-[10px] font-bold ${testResult.success ? 'text-emerald-400' : 'text-rose-400'}`}>
                   {testResult.message}
                </div>
             )}
           </div>
        </Section>

        <button 
          type="submit" 
          disabled={saving}
          className="w-full relative overflow-hidden group py-3 bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20 hover:border-amber-500/50 disabled:opacity-50 text-amber-500 font-bold font-mono tracking-wide text-sm rounded-lg transition-all mt-8"
        >
          {saving ? 'SAVING & RESTARTING...' : 'SAVE CONFIGURATION'}
        </button>

      </form>
    </div>
  );
}

function Section({ title, children }: { title: string, children: React.ReactNode }) {
  return (
    <div className="bg-[#0D1016] p-4 rounded-xl border border-slate-800">
      <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-3">{title}</h3>
      {children}
    </div>
  );
}

function Label({ children, className = '' }: { children: React.ReactNode, className?: string }) {
  return <label className={`block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 ${className}`}>{children}</label>;
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input 
      {...props} 
      className="w-full bg-black/40 border border-slate-800 rounded p-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500 transition-colors font-mono"
    />
  );
}
