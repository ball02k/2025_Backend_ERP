import React from 'react';
import { useParams } from 'react-router-dom';
import { apiGet } from '@/lib/api';
import EntityHeader from '@/components/EntityHeader';
import EntityDocuments from '@/components/documents/EntityDocuments.jsx';

export default function HsShow(){
  const { id } = useParams();
  const hsId = Number(id);
  const [row, setRow] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState('');

  async function load(){
    try {
      const res = await apiGet(`/api/hs/events/${hsId}`);
      const data = res?.data || res;
      setRow(data || null);
    } catch(e){ setErr(e.message || 'Failed to load H&S event'); }
    finally { setLoading(false); }
  }
  React.useEffect(()=>{ if(Number.isFinite(hsId)) load(); }, [hsId]);

  if (!Number.isFinite(hsId)) return <div className="p-4">Invalid H&S id</div>;
  if (loading) return <div className="p-4 text-sm text-slate-600">Loading…</div>;
  if (err) return <div className="p-4 text-sm text-red-600">{err}</div>;
  if (!row) return <div className="p-4">Not found</div>;

  return (
    <div className="p-4 space-y-4">
      <EntityHeader
        title={row.title || `H&S #${hsId}`}
        subtitle={row.type || ''}
        entityType="hs/events"
        entityId={hsId}
        data={row}
        fields={[{ name:'status', label:'Status' }, { name:'severity', label:'Severity' }, { name:'eventDate', label:'Date' }]}
        refresh={load}
      />
      <EntityDocuments entityType="hs" entityId={hsId} projectId={row.projectId} title="H&S Documents" />
    </div>
  );
}
