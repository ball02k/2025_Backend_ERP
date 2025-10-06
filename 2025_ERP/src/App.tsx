import React, { Suspense, lazy } from "react";
import ErrorBoundary from '@/components/ErrorBoundary.jsx';
import RecoveryBanner from '@/components/RecoveryBanner';
import RequireAuth from '@/components/RequireAuth';
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import DemoBanner from '@/components/demo/DemoBanner.jsx';

const FallbackShell: React.FC<React.PropsWithChildren> = ({ children }) => (
  <div className="min-h-screen bg-slate-50 text-slate-900">{children}</div>
);

const SuppliersPage = lazy(() => import("./pages/SuppliersPage.jsx"));
const PosList = lazy(() => import("./pages/finance/PosList"));
const PoDetail = lazy(() => import("./pages/finance/PoDetail"));
const InvoicesList = lazy(() => import("./pages/finance/InvoicesList"));
const MatchingQueue = lazy(() => import('./pages/finance/MatchingQueue.jsx'));
const MatchingTriage = lazy(() => import('./pages/finance/MatchingTriage.jsx'));
const AfpPanel = lazy(() => import('./pages/project/financials/AfpPanel.jsx'));
const InvoiceDetail = lazy(() => import("./pages/finance/InvoiceDetail"));
const HealthPage = lazy(() => import('./pages/dev/Health'));
const OnboardPublic = lazy(() => import("./pages/public/OnboardPublic.jsx"));
const LoginPage = lazy(() => import("./pages/Login"));
const DocumentsHub = lazy(() => import('./pages/DocumentsHub.jsx'));
const ProjectInfo = lazy(() => import('./pages/project/Info.jsx'));
const ProjectFinanceShell = lazy(() => import('./pages/project/Finance'));
const RfiShow = lazy(() => import('./pages/RfiShow.jsx'));
const QaShow = lazy(() => import('./pages/QaShow.jsx'));
const HsShow = lazy(() => import('./pages/HsShow.jsx'));
const CarbonShow = lazy(() => import('./pages/CarbonShow.jsx'));
const ReceiptList = lazy(() => import('./pages/finance/receipt/ReceiptList.jsx'));
const FinanceSettings = lazy(() => import('./pages/finance/Settings.jsx'));
const ProjectEdit = lazy(() => import('./pages/projects/ProjectEdit.jsx'));
const SupplierEdit = lazy(() => import('./pages/suppliers/SupplierEdit.jsx'));
const VariationEdit = lazy(() => import('./pages/variations/VariationEdit.jsx'));
const TaskEdit = lazy(() => import('./pages/tasks/TaskEdit.jsx'));
const InvoiceNew = lazy(() => import('./pages/finance/invoice/InvoiceNew.jsx'));
const RfxList = lazy(() => import('./pages/rfx/RfxList.jsx'));
const RfxDetail = lazy(() => import('./pages/rfx/RfxDetail.jsx'));
const CarbonList = lazy(() => import('./pages/carbon/CarbonList.jsx'));
const ApprovalList = lazy(() => import('./pages/approvals/ApprovalList.jsx'));
const MeetingList = lazy(() => import('./pages/meetings/MeetingList.jsx'));
const AuditList = lazy(() => import('./pages/audit/AuditList.jsx'));
const ReportList = lazy(() => import('./pages/reports/ReportList.jsx'));
const DemoTour = lazy(() => import('./pages/demo/Tour.jsx'));

export default function App() {
  const loc = useLocation();
  const isDemo = (loc.pathname || '').startsWith('/demo');
  // Attempt to eagerly load an AppShell component if present; otherwise use fallback
  const shells = import.meta.glob('./components/layout/AppShell.{tsx,jsx}', { eager: true }) as Record<string, { default: React.ComponentType<any> }>;
  const AppShell = Object.values(shells)[0]?.default as React.ComponentType<any> | undefined;
  const Shell = AppShell ?? FallbackShell;
  const RoutesBlock = (
    <Suspense fallback={<div className="p-6 text-sm text-slate-600">Loading…</div>}>
      <Routes>
          <Route path="/" element={<Navigate to="/suppliers" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/suppliers" element={<SuppliersPage />} />
          <Route path="/__health" element={<RequireAuth><HealthPage /></RequireAuth>} />
          {/* Documents hub */}
          <Route path="/documents" element={<RequireAuth><DocumentsHub /></RequireAuth>} />
          {/* Finance */}
          <Route path="/finance/pos" element={<RequireAuth><PosList /></RequireAuth>} />
          <Route path="/finance/pos/:id" element={<RequireAuth><PoDetail /></RequireAuth>} />
          <Route path="/finance/invoices" element={<RequireAuth><InvoicesList /></RequireAuth>} />
          <Route path="/finance/invoices/:id" element={<RequireAuth><InvoiceDetail /></RequireAuth>} />
          <Route path="/finance/invoices/new" element={<RequireAuth><InvoiceNew /></RequireAuth>} />
          <Route path="/finance/receipts" element={<RequireAuth><ReceiptList /></RequireAuth>} />
          <Route path="/finance/matching" element={<RequireAuth><MatchingQueue /></RequireAuth>} />
          <Route path="/finance/matching/:invoiceId" element={<RequireAuth><MatchingTriage /></RequireAuth>} />
          <Route path="/finance/settings" element={<RequireAuth><FinanceSettings /></RequireAuth>} />
          {/* Delivery */}
          <Route path="/rfx" element={<RequireAuth><RfxList /></RequireAuth>} />
          <Route path="/rfx/:id" element={<RequireAuth><RfxDetail /></RequireAuth>} />
          <Route path="/carbon" element={<RequireAuth><CarbonList /></RequireAuth>} />
          <Route path="/approvals" element={<RequireAuth><ApprovalList /></RequireAuth>} />
          <Route path="/meetings" element={<RequireAuth><MeetingList /></RequireAuth>} />
          <Route path="/audit" element={<RequireAuth><AuditList /></RequireAuth>} />
          <Route path="/reports" element={<RequireAuth><ReportList /></RequireAuth>} />
          {/* Projects and entity detail routes */}
          <Route path="/projects/:id" element={<RequireAuth><ErrorBoundary><ProjectInfo /></ErrorBoundary></RequireAuth>} />
          {/* Project-scoped Finance (reusing global finance pages with implicit projectId filter) */}
          <Route path="/projects/:id/finance" element={<RequireAuth><ProjectFinanceShell /></RequireAuth>}>
            <Route path="invoices" element={<RequireAuth><InvoicesList /></RequireAuth>} />
            <Route path="invoices/new" element={<RequireAuth><InvoiceNew /></RequireAuth>} />
            <Route path="pos" element={<RequireAuth><PosList /></RequireAuth>} />
            <Route path="receipts" element={<RequireAuth><ReceiptList /></RequireAuth>} />
            <Route path="matching" element={<RequireAuth><MatchingQueue /></RequireAuth>} />
            <Route path="afp" element={<RequireAuth><AfpPanel /></RequireAuth>} />
            <Route path="matching/:invoiceId" element={<RequireAuth><MatchingTriage /></RequireAuth>} />
            <Route path="settings" element={<RequireAuth><FinanceSettings /></RequireAuth>} />
            <Route path="invoices/:invoiceId" element={<RequireAuth><InvoiceDetail /></RequireAuth>} />
            <Route path="pos/:poId" element={<RequireAuth><PoDetail /></RequireAuth>} />
          </Route>
          <Route path="/projects/new" element={<RequireAuth><ProjectEdit /></RequireAuth>} />
          <Route path="/projects/:id/edit" element={<RequireAuth><ProjectEdit /></RequireAuth>} />
          <Route path="/rfi/:id" element={<RequireAuth><RfiShow /></RequireAuth>} />
          <Route path="/qa/:id" element={<RequireAuth><QaShow /></RequireAuth>} />
          <Route path="/hs/:id" element={<RequireAuth><HsShow /></RequireAuth>} />
          <Route path="/carbon/:id" element={<RequireAuth><CarbonShow /></RequireAuth>} />
          {/* Suppliers */}
          <Route path="/suppliers/new" element={<RequireAuth><SupplierEdit /></RequireAuth>} />
          <Route path="/suppliers/:id/edit" element={<RequireAuth><SupplierEdit /></RequireAuth>} />
          {/* Variations */}
          <Route path="/variations/new" element={<RequireAuth><VariationEdit /></RequireAuth>} />
          <Route path="/variations/:id/edit" element={<RequireAuth><VariationEdit /></RequireAuth>} />
          {/* Tasks */}
          <Route path="/tasks/new" element={<RequireAuth><TaskEdit /></RequireAuth>} />
          {/* Demo */}
          <Route path="/demo-tour" element={<RequireAuth><DemoTour /></RequireAuth>} />
          {/* Public, no auth */}
          <Route path="/onboard/:token" element={<OnboardPublic />} />
          {/* 404 */}
          <Route path="*" element={<div className="p-6">Not found</div>} />
      </Routes>
    </Suspense>
  );

  return (
    <Shell>
      <DemoBanner />
      <RecoveryBanner />
      {RoutesBlock}
    </Shell>
  );
}
