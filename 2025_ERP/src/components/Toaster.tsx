import React from 'react';

export type Toast = { id: number; message: string; type?: 'info' | 'success' | 'error' };

let counter = 1;
export function pushToast(message: string, type: Toast['type'] = 'info') {
  try {
    const ev = new CustomEvent('app:toast', { detail: { id: counter++, message, type } as Toast });
    window.dispatchEvent(ev);
  } catch {
    console.log(`[toast] ${type}: ${message}`);
  }
}

export default function Toaster() {
  const [toasts, setToasts] = React.useState<Toast[]>([]);

  React.useEffect(() => {
    function onToast(e: Event) {
      const ce = e as CustomEvent<Toast>;
      const t = ce.detail;
      setToasts((arr) => [...arr, t]);
      // Auto-dismiss after 4s
      setTimeout(() => setToasts((arr) => arr.filter((x) => x.id !== t.id)), 4000);
    }
    window.addEventListener('app:toast', onToast as any);
    return () => window.removeEventListener('app:toast', onToast as any);
  }, []);

  return (
    <div className="fixed right-3 top-3 z-50 space-y-2">
      {toasts.map((t) => (
        <div key={t.id} role="status" className={`rounded-lg border px-3 py-2 shadow-md text-sm bg-white ${
          t.type === 'error' ? 'border-red-300 text-red-800' : t.type === 'success' ? 'border-emerald-300 text-emerald-800' : 'border-slate-300 text-slate-800'
        }`}>
          {t.message}
        </div>
      ))}
    </div>
  );
}

