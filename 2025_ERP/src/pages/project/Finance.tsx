import React from 'react';
import { NavLink, Outlet, useParams } from 'react-router-dom';
import { ProjectFinanceContext } from './FinanceContext';
import { setFinanceProjectId } from '@/lib/financeScope';

export default function ProjectFinanceShell() {
  const { id } = useParams();
  const base = `/projects/${id}/finance`;
  React.useEffect(() => {
    const pid = Number(id);
    setFinanceProjectId(Number.isFinite(pid) ? pid : undefined);
    return () => setFinanceProjectId(undefined);
  }, [id]);
  const linkBase = 'block px-3 py-2 rounded-md hover:bg-slate-200/60';
  const linkActive = 'bg-slate-200 font-medium';
  return (
    <ProjectFinanceContext.Provider value={{ projectId: Number(id) }}>
    <div className="min-h-[60vh] grid grid-cols-[220px_1fr] bg-slate-50 text-slate-900 rounded-xl border">
      <aside className="border-r border-slate-200 p-3">
        <div className="px-2 py-1 text-xs uppercase tracking-wide text-slate-500">Finance</div>
        <nav className="space-y-1">
          <NavLink to={`${base}/invoices`} className={({isActive})=>`${linkBase} ${isActive?linkActive:''}`}>Invoices</NavLink>
          <NavLink to={`${base}/pos`} className={({isActive})=>`${linkBase} ${isActive?linkActive:''}`}>Purchase Orders</NavLink>
          <NavLink to={`${base}/receipts`} className={({isActive})=>`${linkBase} ${isActive?linkActive:''}`}>Receipts</NavLink>
          <NavLink to={`${base}/matching`} className={({isActive})=>`${linkBase} ${isActive?linkActive:''}`}>Matching</NavLink>
          <NavLink to={`${base}/afp`} className={({isActive})=>`${linkBase} ${isActive?linkActive:''}`}>AFP</NavLink>
          <NavLink to={`${base}/settings`} className={({isActive})=>`${linkBase} ${isActive?linkActive:''}`}>Settings</NavLink>
        </nav>
      </aside>
      <main className="bg-white">
        <Outlet />
      </main>
    </div>
    </ProjectFinanceContext.Provider>
  );
}
