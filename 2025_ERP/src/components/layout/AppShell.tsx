import React from 'react';
import { NavLink } from 'react-router-dom';

const linkBase = 'block px-3 py-2 rounded-md hover:bg-slate-200/60';
const linkActive = 'bg-slate-200 font-medium';

const SidebarLink: React.FC<{ to: string; children: React.ReactNode }> = ({ to, children }) => (
  <NavLink
    to={to}
    className={({ isActive }) => `${linkBase} ${isActive ? linkActive : ''}`}
  >
    {children}
  </NavLink>
);

const AppShell: React.FC<React.PropsWithChildren> = ({ children }) => {
  const showFinance = true;
  const showPo = true;
  const showInv = true;

  return (
    <div className="min-h-screen grid grid-cols-[220px_1fr] bg-slate-50 text-slate-900">
      <aside className="border-r border-slate-200 p-3">
        <div className="px-2 py-2 text-sm font-semibold text-slate-700 uppercase tracking-wide">ERP</div>
        <nav className="space-y-1">
          <SidebarLink to="/suppliers">Suppliers</SidebarLink>
          {showFinance && (
            <div className="mt-2">
              <div className="px-2 py-1 text-xs uppercase tracking-wide text-slate-500">Finance</div>
              {showPo && <SidebarLink to="/finance/pos">Purchase Orders</SidebarLink>}
              {showInv && <SidebarLink to="/finance/invoices">Invoices</SidebarLink>}
            </div>
          )}
        </nav>
      </aside>
      <main>
        {children}
      </main>
    </div>
  );
};

export default AppShell;
