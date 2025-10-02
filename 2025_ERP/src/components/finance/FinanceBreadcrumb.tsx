import React from 'react';
import { useParams } from 'react-router-dom';
import { useProjectFinance } from '@/pages/project/FinanceContext';

type Section = 'invoices'|'pos'|'receipts'|'matching'|'settings'|undefined;

export default function FinanceBreadcrumb({ section }: { section?: Section }) {
  const { id: routeId } = useParams();
  const ctx = (typeof useProjectFinance === 'function' ? useProjectFinance() : {}) as any;
  const projectId = Number.isFinite(ctx?.projectId) ? Number(ctx.projectId) : (routeId ? Number(routeId) : undefined);

  const map: Record<string, string> = {
    invoices: 'invoices',
    pos: 'pos',
    receipts: 'receipts',
    matching: 'matching',
    settings: 'settings'
  };
  const sec = section ? map[section] : '';
  const href = projectId
    ? (sec ? `/projects/${projectId}/finance/${sec}` : `/projects/${projectId}/finance`)
    : (sec ? `/finance/${sec}` : `/finance/invoices`);

  return (
    <div className="text-sm">
      <a className="underline" href={href}>{projectId ? 'Back to Project Finance' : 'Back to Finance'}</a>
    </div>
  );
}

