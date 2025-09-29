import React, { Suspense, lazy } from "react";
import RecoveryBanner from '@/components/RecoveryBanner';
import RequireAuth from '@/components/RequireAuth';
import { Routes, Route, Navigate } from "react-router-dom";

const FallbackShell: React.FC<React.PropsWithChildren> = ({ children }) => (
  <div className="min-h-screen bg-slate-50 text-slate-900">{children}</div>
);

const SuppliersPage = lazy(() => import("./pages/SuppliersPage.jsx"));
const PosList = lazy(() => import("./pages/finance/PosList"));
const PoDetail = lazy(() => import("./pages/finance/PoDetail"));
const InvoicesList = lazy(() => import("./pages/finance/InvoicesList"));
const InvoiceDetail = lazy(() => import("./pages/finance/InvoiceDetail"));
const HealthPage = lazy(() => import('./pages/dev/Health'));
const OnboardPublic = lazy(() => import("./pages/public/OnboardPublic.jsx"));
const LoginPage = lazy(() => import("./pages/Login"));

export default function App() {
  // Attempt to eagerly load an AppShell component if present; otherwise use fallback
  const shells = import.meta.glob('./components/layout/AppShell.{tsx,jsx}', { eager: true }) as Record<string, { default: React.ComponentType<any> }>;
  const AppShell = Object.values(shells)[0]?.default as React.ComponentType<any> | undefined;
  const Shell = AppShell ?? FallbackShell;
  return (
    <Shell>
      <RecoveryBanner />
      <Suspense fallback={<div className="p-6 text-sm text-slate-600">Loading…</div>}>
        <Routes>
          <Route path="/" element={<Navigate to="/suppliers" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/suppliers" element={<SuppliersPage />} />
          <Route path="/__health" element={<RequireAuth><HealthPage /></RequireAuth>} />
          {/* Finance */}
          <Route path="/finance/pos" element={<RequireAuth><PosList /></RequireAuth>} />
          <Route path="/finance/pos/:id" element={<RequireAuth><PoDetail /></RequireAuth>} />
          <Route path="/finance/invoices" element={<RequireAuth><InvoicesList /></RequireAuth>} />
          <Route path="/finance/invoices/:id" element={<RequireAuth><InvoiceDetail /></RequireAuth>} />
          {/* Admin (Feature Flags removed in Task-14 rollback) */}
          {/* Public, no auth */}
          <Route path="/onboard/:token" element={<OnboardPublic />} />
          {/* 404 */}
          <Route path="*" element={<div className="p-6">Not found</div>} />
        </Routes>
      </Suspense>
    </Shell>
  );
}
