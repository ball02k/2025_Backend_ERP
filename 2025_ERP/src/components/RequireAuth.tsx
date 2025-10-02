import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useSession } from '@/lib/auth';

export default function RequireAuth({ children }: { children: React.ReactNode; feature?: string }) {
  const { session, ready } = useSession();
  const loc = useLocation();

  if (!ready) return <div className="p-4 text-sm text-gray-500">Loading…</div>;
  if (!session?.token) return <Navigate to={`/login?return=${encodeURIComponent(loc.pathname+loc.search+loc.hash)}`} replace />;
  return <>{children}</>;
}
