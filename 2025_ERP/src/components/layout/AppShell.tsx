import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import Toaster from '@/components/Toaster';
import LogoutButton from '@/components/LogoutButton';

const linkBase = 'block px-3 py-2 rounded-md hover:bg-slate-200/60';
const linkActive = 'bg-slate-200 font-medium';

const SidebarLink: React.FC<{ to: string; children: React.ReactNode }> = ({ to, children }) => {
  const loc = useLocation();
  const isDemo = (loc.pathname || '').startsWith('/demo');
  const prefixed = isDemo && !to.startsWith('/demo') ? `/demo${to}` : to;
  return (
    <NavLink to={prefixed} className={({ isActive }) => `${linkBase} ${isActive ? linkActive : ''}`}>
      {children}
    </NavLink>
  );
};

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
          <div className="mt-2">
            <div className="px-2 py-1 text-xs uppercase tracking-wide text-slate-500">Finance</div>
            <SidebarLink to="/finance/invoices">Invoices</SidebarLink>
            <SidebarLink to="/finance/pos">Purchase Orders</SidebarLink>
            <SidebarLink to="/finance/receipts">Receipts</SidebarLink>
            <SidebarLink to="/finance/matching">Matching</SidebarLink>
            <SidebarLink to="/finance/settings">Settings</SidebarLink>
          </div>
          <div className="mt-2">
            <div className="px-2 py-1 text-xs uppercase tracking-wide text-slate-500">Procurement</div>
            <SidebarLink to="/rfx">RFx</SidebarLink>
            <SidebarLink to="/carbon">Carbon</SidebarLink>
            <SidebarLink to="/approvals">Approvals</SidebarLink>
            <SidebarLink to="/meetings">Meetings & Comms</SidebarLink>
            <SidebarLink to="/audit">Audit</SidebarLink>
            <SidebarLink to="/reports">Reports</SidebarLink>
          </div>
        </nav>
      </aside>
      <main>
        <Toaster />
        <div className="flex items-center justify-end border-b border-slate-200 px-3 py-2 bg-white">
          <LogoutButton />
        </div>
        {children}
      </main>
    </div>
  );
};

export default AppShell;
