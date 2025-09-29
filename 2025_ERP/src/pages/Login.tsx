import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { isAuthed, setToken, setTenantId } from '@/lib/auth';

export default function Login() {
  const [email, setEmail] = useState('admin@demo.local');
  const [password, setPassword] = useState('demo1234');
  const [tenant, setTenant] = useState(localStorage.getItem('tenantId') || 'demo');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  const [sp] = useSearchParams();

  const ret = sp.get('return') || '/';

  useEffect(() => {
    if (isAuthed()) nav(ret, { replace: true });
  }, [nav, ret]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      // Prefer backend dev-token when available (ENABLE_DEV_AUTH=1 on server)
      const resp = await fetch('/api/dev-token');
      const data = await resp.json().catch(()=>({}));
      if (resp.ok && data?.token) {
        setToken(data.token);
        setTenantId(data?.user?.tenantId || tenant || 'demo');
        nav(ret, { replace: true });
        return;
      }
      // Fallback stub if dev-token not available
      setToken('dev_local_token');
      setTenantId(tenant || 'demo');
      nav(ret, { replace: true });
    } catch (e: any) {
      setErr(e?.message || 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <form onSubmit={handleSubmit} className="w-full max-w-sm bg-white p-6 rounded-2xl shadow">
        <h1 className="text-xl font-semibold mb-4">Sign in</h1>
        <label className="block mb-3">
          <span className="block text-sm mb-1">Email</span>
          <input type="email" className="w-full rounded-md border px-3 py-2" value={email} onChange={(e)=>setEmail(e.target.value)} />
        </label>
        <label className="block mb-3">
          <span className="block text-sm mb-1">Password</span>
          <input type="password" className="w-full rounded-md border px-3 py-2" value={password} onChange={(e)=>setPassword(e.target.value)} />
        </label>
        <label className="block mb-4">
          <span className="block text-sm mb-1">Tenant</span>
          <input className="w-full rounded-md border px-3 py-2" value={tenant} onChange={(e)=>setTenant(e.target.value)} />
        </label>
        {err && <div className="mb-3 text-sm text-red-600">{err}</div>}
        <button type="submit" disabled={busy} className="w-full px-3 py-2 rounded-md bg-blue-600 text-white">
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="text-xs text-slate-500 mt-3">This is a local dev login stub.</p>
      </form>
    </div>
  );
}
