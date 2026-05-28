import { LogEntry } from '../types';

export default function Logs({ logs }: { logs: LogEntry[] }) {
  return (
    <div className="p-4 space-y-4 h-full flex flex-col">
      <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Live Activity Logs</h3>
      
      <div className="flex-1 overflow-y-auto bg-black/40 rounded-lg p-3 font-mono text-[10px] space-y-1.5">
        {logs.length === 0 ? (
          <div className="text-slate-600">No logs...</div>
        ) : (
          logs.map(log => (
            <div key={log.id} className="break-words leading-tight">
              <span className="text-slate-500 mr-2 shrink-0">
                [{new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Makassar', hour: '2-digit', minute:'2-digit', second:'2-digit' }).format(new Date(log.timestamp))}]
              </span>
              <span className={
                log.level === 'error' ? 'text-red-400' :
                log.level === 'warn' ? 'text-amber-500' :
                'text-slate-300'
              }>
                {log.level === 'error' ? '[ERROR]' : log.level === 'warn' ? '[WARN]' : '[INFO]'} {log.message}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
