import React from 'react';

// Simple 2025 DataGrid: header filters + right-aligned sort, LS persistence
export default function DataGrid({ columns = [], fetcher, stateKey = 'grid' }) {
  const initial = React.useMemo(() => {
    try { return JSON.parse(localStorage.getItem(stateKey) || '{}'); } catch { return {}; }
  }, [stateKey]);

  const [items, setItems] = React.useState([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [limit, setLimit] = React.useState(initial.limit || 25);
  const [offset, setOffset] = React.useState(initial.offset || 0);
  const [orderBy, setOrderBy] = React.useState(initial.orderBy || '');
  const [filters, setFilters] = React.useState(initial.filters || {});

  const totalPages = Math.max(Math.ceil((total || 0) / (limit || 1)), 1);
  const page = Math.floor(offset / limit) + 1;

  // Persist state
  React.useEffect(() => {
    const data = { limit, offset, orderBy, filters };
    try { localStorage.setItem(stateKey, JSON.stringify(data)); } catch {}
  }, [limit, offset, orderBy, filters, stateKey]);

  // Keep a stable ref to the latest fetcher to avoid effect loops when parent re-renders
  const fetcherRef = React.useRef(fetcher);
  React.useEffect(() => { fetcherRef.current = fetcher; }, [fetcher]);

  // Fetch
  const load = React.useCallback(async () => {
    const fx = fetcherRef.current;
    if (!fx) return;
    setLoading(true); setError('');
    try {
      const { items, total } = await fx({ limit, offset, orderBy, filters });
      setItems(Array.isArray(items) ? items : []);
      setTotal(Number(total || (Array.isArray(items) ? items.length : 0)));
    } catch (e) {
      setError(e?.message || 'Failed to load');
      setItems([]); setTotal(0);
    } finally { setLoading(false); }
  }, [limit, offset, orderBy, filters]);

  React.useEffect(() => { load(); }, [load]);

  // Handle sort cycling: none -> asc -> desc -> none
  function nextSort(colKey) {
    const current = orderBy && orderBy.startsWith(colKey + '.') ? orderBy.split('.')[1] : '';
    const next = current === '' ? 'asc' : current === 'asc' ? 'desc' : '';
    const ob = next ? `${colKey}.${next}` : '';
    setOrderBy(ob); setOffset(0);
  }

  // Dynamic options cache for select filters
  const [optionsCache, setOptionsCache] = React.useState({});
  async function ensureOptions(col) {
    if (!col?.filter || col.filter.type !== 'select') return;
    if (Array.isArray(col.filter.options)) return;
    const key = col.key;
    if (optionsCache[key]) return;
    try {
      const opts = await col.filter.options();
      setOptionsCache((c) => ({ ...c, [key]: opts || [] }));
    } catch { /* ignore */ }
  }

  // Render header cell with right-aligned sort button and filter control beneath
  function HeaderCell({ col }) {
    const sortable = !!col.sortable;
    const active = orderBy && orderBy.startsWith(col.key + '.');
    const dir = active ? orderBy.split('.')[1] : '';
    return (
      <th scope="col" className="px-2 py-1 align-bottom">
        <div className="relative pr-6">
          <span className="text-xs uppercase tracking-wide text-gray-600">{col.header || col.key}</span>
          {sortable && (
            <button
              className="absolute right-0 top-0 text-gray-500 hover:text-gray-800"
              title={active ? `Sort ${dir}` : 'Sort'}
              onClick={() => nextSort(col.serverKey || col.key)}
              aria-label="Sort"
            >
              {dir === 'asc' ? '▴' : dir === 'desc' ? '▾' : '↕'}
            </button>
          )}
        </div>
        {col.filter ? (
          <div className="mt-1">
            {col.filter.type === 'text' && (
              <input
                className="w-full rounded border px-2 py-1 text-sm"
                placeholder={col.filter.placeholder || 'contains…'}
                defaultValue={filters[col.key] || ''}
                onChange={(e) => { setFilters((f) => ({ ...f, [col.key]: e.target.value })); setOffset(0); }}
              />
            )}
            {col.filter.type === 'date' && (
              <input
                type="date"
                className="w-full rounded border px-2 py-1 text-sm"
                defaultValue={filters[col.key] || ''}
                onChange={(e) => { setFilters((f) => ({ ...f, [col.key]: e.target.value })); setOffset(0); }}
              />
            )}
            {col.filter.type === 'select' && (
              <select
                className="w-full rounded border px-2 py-1 text-sm"
                value={filters[col.key] || ''}
                onChange={(e) => { setFilters((f) => ({ ...f, [col.key]: e.target.value })); setOffset(0); }}
                onFocus={() => ensureOptions(col)}
              >
                <option value="">All</option>
                {(
                  Array.isArray(col.filter.options)
                    ? col.filter.options
                    : (optionsCache[col.key] || [])
                ).map((opt, i) => (
                  <option key={i} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            )}
          </div>
        ) : null}
      </th>
    );
  }

  return (
    <div className="rounded-2xl border bg-white shadow-sm">
      <div className="p-2 border-b flex items-center justify-between">
        <div className="text-xs text-gray-600">{loading ? 'Loading…' : `${total} items`}</div>
        <div className="flex items-center gap-2 text-sm">
          <label className="flex items-center gap-1">Per page
            <select className="rounded border px-1 py-0.5" value={limit} onChange={(e)=>{ setLimit(Number(e.target.value)); setOffset(0); }}>
              {[10,25,50,100].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <div className="flex items-center gap-1">
            <button className="rounded border px-2 py-0.5" onClick={()=> setOffset(Math.max(offset - limit, 0))} disabled={offset<=0}>Prev</button>
            <span className="text-xs text-gray-600">Page {page} / {totalPages}</span>
            <button className="rounded border px-2 py-0.5" onClick={()=> setOffset(Math.min(offset + limit, (totalPages-1)*limit))} disabled={page>=totalPages}>Next</button>
          </div>
        </div>
      </div>
      {error && <div className="px-3 py-2 text-sm text-red-600">{error}</div>}
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr>
              {columns.map((c, i) => <HeaderCell key={i} col={c} />)}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={columns.length} className="px-3 py-6 text-center text-gray-500">Loading…</td></tr>
            )}
            {!loading && items.length === 0 && (
              <tr><td colSpan={columns.length} className="px-3 py-6 text-center text-gray-500">No results</td></tr>
            )}
            {!loading && items.map((r, ri) => (
              <tr key={ri} className="hover:bg-slate-50">
                {columns.map((c, ci) => (
                  <td key={ci} className="px-2 py-2 align-top">
                    {typeof c.render === 'function' ? c.render(r) : (r[c.key] ?? '—')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
