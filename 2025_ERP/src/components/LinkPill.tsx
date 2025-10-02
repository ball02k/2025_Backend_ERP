import { Link, useLocation } from 'react-router-dom';

export type LinkDTO = { type: string; id: number | string; label?: string; route: string } & Record<string, any>;

export default function LinkPill({ link }: { link?: LinkDTO | null }) {
  if (!link) return null;
  const label = link.label ?? `${link.type} #${link.id}`;
  const loc = useLocation();
  const isDemo = (loc.pathname || '').startsWith('/demo');
  const route = link.route || '#';
  const to = isDemo && route.startsWith('/') && !route.startsWith('/demo') ? `/demo${route}` : route;
  return (
    <Link to={to} className="inline-flex items-center px-2 py-1 rounded-full text-sm border border-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
      <span className="uppercase text-[10px] tracking-wide mr-2 opacity-60">{link.type}</span>
      <span className="font-medium">{label}</span>
    </Link>
  );
}
