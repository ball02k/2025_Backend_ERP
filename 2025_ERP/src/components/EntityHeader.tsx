import { useState } from 'react';
import { apiPatch } from '@/lib/api';
import LinkPill, { LinkDTO } from '@/components/LinkPill';

type Field = { name: string; label: string; type?: 'text'|'textarea'; listId?: string; options?: string[] };

export default function EntityHeader({
  title,
  subtitle,
  entityType,
  entityId,
  fields = [],
  data = {},
  links = [],
  refresh,
}: {
  title: string;
  subtitle?: string;
  entityType: string;
  entityId: number | string;
  fields?: Field[];
  data?: Record<string, any>;
  links?: LinkDTO[];
  refresh?: () => void;
}) {
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState<Record<string, any>>({});

  function startEdit(){ setDraft({}); setEdit(true); }
  function cancel(){ setDraft({}); setEdit(false); }

  async function save(){
    await apiPatch(`/api/${entityType}/${entityId}`, { ...draft, reason: 'inline edit' });
    setEdit(false);
    refresh?.();
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 mb-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{title}</h1>
          {subtitle && <p className="text-slate-500">{subtitle}</p>}
        </div>
        <div className="flex gap-2">
          {!edit && <button className="px-3 py-1 rounded-md border" onClick={startEdit}>Edit</button>}
          {edit && (
            <>
              <button className="px-3 py-1 rounded-md border" onClick={cancel}>Cancel</button>
              <button className="px-3 py-1 rounded-md bg-blue-600 text-white" onClick={save}>Save</button>
            </>
          )}
        </div>
      </div>
      {links?.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">{links.map((l, i) => <LinkPill key={i} link={l} />)}</div>
      )}
      {fields?.length > 0 && (
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          {fields.map(f => (
            <label key={f.name} className="block">
              <span className="block text-sm text-slate-600">{f.label}</span>
              {!edit ? (
                <div className="py-2">{data?.[f.name] ?? '—'}</div>
              ) : f.type === 'textarea' ? (
                <textarea
                  rows={3}
                  className="w-full rounded-md border px-3 py-2"
                  defaultValue={data?.[f.name] || ''}
                  onChange={e=>setDraft(d=>({ ...d, [f.name]: e.target.value }))}
                />
              ) : (
                <>
                  <input
                    className="w-full rounded-md border px-3 py-2"
                    defaultValue={data?.[f.name] || ''}
                    onChange={e=>setDraft(d=>({ ...d, [f.name]: e.target.value }))}
                    list={f.options && f.options.length ? f.listId : undefined}
                  />
                  {f.options && f.options.length ? (
                    <datalist id={f.listId}>
                      {f.options.map((opt) => (
                        <option key={opt} value={opt} />
                      ))}
                    </datalist>
                  ) : null}
                </>
              )}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
