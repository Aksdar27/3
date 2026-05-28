/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Home as HomeIcon, Settings as SettingsIcon, Clock, Terminal, Activity } from 'lucide-react';
import { ServerState, AppSettings } from './types';
import Home from './components/Home';
import Settings from './components/Settings';
import History from './components/History';
import Logs from './components/Logs';

export default function App() {
  const [activeTab, setActiveTab] = useState<'home'|'settings'|'history'|'logs'>('home');
  const [state, setState] = useState<ServerState | null>(null);

  useEffect(() => {
    const sse = new EventSource('/api/stream');
    sse.onmessage = (e) => {
      try {
        setState(JSON.parse(e.data));
      } catch (err) {}
    };
    return () => sse.close();
  }, []);

  const handleSaveSettings = async (settings: AppSettings) => {
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    });
  };

  return (
    <div className="flex flex-col h-screen bg-[#0A0C10] text-slate-200 font-sans overflow-hidden">
      {/* Top Bar with Live Price */}
      <header className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-slate-800 bg-[#0F1218] sticky top-0 z-10 shrink-0">
        <div className="flex items-center space-x-3 sm:space-x-4 shrink">
          <div className="bg-amber-500/10 p-2 rounded-lg hidden sm:block">
            <Activity className="w-6 h-6 text-amber-500" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-bold tracking-tight text-white truncate">XAUUSD SMC</h1>
            <p className="text-[10px] sm:text-xs text-slate-500 font-mono truncate">Smart Money Concept</p>
          </div>
        </div>
        
        <div className="flex items-center space-x-4 sm:space-x-8 shrink-0">
          <div className="text-right">
            <div className="text-xl sm:text-2xl font-mono font-bold text-amber-400">
              {state?.price ? state.price.toFixed(3) : '---.---'}
            </div>
            {/* Keeping it simple without the percentage change since it's not provided by API easily yet */}
          </div>
          <div className="flex flex-col items-end border-l border-slate-800 pl-4 sm:pl-6">
            <div className="flex items-center space-x-2">
              <span className="text-[9px] sm:text-[10px] uppercase tracking-wider text-slate-400 whitespace-nowrap">
                {state?.status === 'LIVE' ? 'TwelveData WS' : state?.status === 'FALLBACK' ? 'Yahoo REST' : state?.status || 'CONNECTING'}
              </span>
              <div className={`w-2 h-2 rounded-full ${
                  state?.status === 'LIVE' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)] animate-pulse' :
                  state?.status === 'FALLBACK' ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]' :
                  state?.status === 'CONNECTING' ? 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)] animate-pulse' :
                  'bg-red-500'
               }`}></div>
            </div>
            <div className="text-[9px] sm:text-[10px] text-slate-500 mt-1">v1.2.4</div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto w-full max-w-lg mx-auto pb-20 scroll-smooth custom-scrollbar">
        {activeTab === 'home' && <Home signals={state?.signals || []} smcState={state?.smcState} status={state?.status} lastTickTime={state?.lastTickTime} settings={state?.settings} riskStats={state?.riskStats} />}
        {activeTab === 'settings' && <Settings current={state?.settings} onSave={handleSaveSettings} />}
        {activeTab === 'history' && <History signals={state?.signals || []} />}
        {activeTab === 'logs' && <Logs logs={state?.logs || []} />}
      </main>

      {/* Bottom Navigation */}
      <nav className="h-16 bg-[#0F1218] border-t border-slate-800 fixed bottom-0 w-full z-10 flex justify-around items-center px-4 sm:max-w-lg sm:left-1/2 sm:-translate-x-1/2">
        <NavItem active={activeTab === 'home'} onClick={() => setActiveTab('home')} icon={<HomeIcon size={20} />} label="Home" />
        <NavItem active={activeTab === 'history'} onClick={() => setActiveTab('history')} icon={<Clock size={20} />} label="History" />
        <NavItem active={activeTab === 'logs'} onClick={() => setActiveTab('logs')} icon={<Terminal size={20} />} label="Logs" />
        <NavItem active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} icon={<SettingsIcon size={20} />} label="Settings" />
      </nav>
    </div>
  );
}

function NavItem({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1 transition-colors ${active ? 'text-amber-500' : 'text-slate-500 hover:text-slate-300'}`}
    >
      <div className="mb-0.5">{icon}</div>
      <span className="text-[10px] font-bold uppercase tracking-tighter">{label}</span>
    </button>
  );
}
