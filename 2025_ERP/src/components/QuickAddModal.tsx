import { useState } from 'react';

type Field = { name: string; label: string; type?: 'text'|'textarea' };

export default function QuickAddModal({ open, title, fields, onSubmit, onClose }:{
  open: boolean; title: string; fields: Field[];
  onSubmit: (data: Record<string, any>) => Promise<void> | void;
  onClose: () => void;
}){
  const [draft, setDraft] = useState<Record<string, any>>({});
  if(!open) return null;
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-xl p-4 w-full max-w-md">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button onClick={onClose} className="text-slate-500">✕</button>
        </div>
        <div className="space-y-3">
          {fields.map(f => (
            <label key={f.name} className="block">
              <span className="block text-sm text-slate-600">{f.label}</span>
              {f.type === 'textarea' ? (
                <textarea rows={3} className="w-full rounded-md border px-3 py-2" onChange={e=>setDraft(d=>({ ...d, [f.name]: e.target.value }))} />
              ) : (
                <input className="w-full rounded-md border px-3 py-2" onChange={e=>setDraft(d=>({ ...d, [f.name]: e.target.value }))} />
              )}
            </label>
          ))}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button className="px-3 py-1 rounded-md border" onClick={onClose}>Cancel</button>
          <button className="px-3 py-1 rounded-md bg-blue-600 text-white" onClick={async()=>{ await onSubmit(draft); onClose(); }}>Create</button>
        </div>
      </div>
    </div>
  );
}

