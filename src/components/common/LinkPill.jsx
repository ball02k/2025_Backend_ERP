import { Link } from 'react-router-dom';

export default function LinkPill({ link }) {
  if (!link) return null;
  const label = link.label ?? `${link.type} #${link.id}`;
  const style = (
    link.type === 'client' ? 'border-emerald-300 text-emerald-800 bg-emerald-50 hover:bg-emerald-100' :
    link.type === 'supplier' ? 'border-amber-300 text-amber-800 bg-amber-50 hover:bg-amber-100' :
    link.type === 'package' ? 'border-indigo-300 text-indigo-800 bg-indigo-50 hover:bg-indigo-100' :
    link.type === 'rfx' ? 'border-violet-300 text-violet-800 bg-violet-50 hover:bg-violet-100' :
    link.type === 'po' ? 'border-sky-300 text-sky-800 bg-sky-50 hover:bg-sky-100' :
    link.type === 'variation' ? 'border-orange-300 text-orange-800 bg-orange-50 hover:bg-orange-100' :
    link.type === 'project' ? 'border-teal-300 text-teal-800 bg-teal-50 hover:bg-teal-100' :
    'border-slate-300 text-slate-800 bg-slate-50 hover:bg-slate-100'
  );
  return (
    <Link
      to={link.route}
      className={`inline-flex items-center px-2 py-1 rounded-full text-sm border ${style}`}
      title={label}
    >
      <span className="uppercase text-[10px] tracking-wide mr-2 opacity-60">{String(link.type)}</span>
      <span className="font-medium">{label}</span>
    </Link>
  );
}

