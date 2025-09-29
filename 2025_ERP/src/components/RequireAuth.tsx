import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';

function getToken(): string | null {
  try { return localStorage.getItem('token'); } catch { return null; }
}

export default function RequireAuth({ children }: { children: React.ReactNode; feature?: string }) {
  const token = getToken();
  const loc = useLocation();

  if (!token) return <Navigate to={`/login?return=${encodeURIComponent(loc.pathname+loc.search+loc.hash)}`} replace />;
  return <>{children}</>;
}
