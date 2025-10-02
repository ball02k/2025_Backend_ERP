import React from 'react';
import { useParams } from 'react-router-dom';
import { apiGet } from '@/lib/api';
import EntityHeader from '@/components/EntityHeader';
import EntityDocuments from '@/components/documents/EntityDocuments.jsx';

export default function QaShow(){
  const { id } = useParams();
  const qaId = Number(id);
  const [row, setRow] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState('');

  async function load(){
    try {
      const res = await apiGet(`/api/qa/records/${qaId}`);
      const data = res?.data || res;
      setRow(data || null);
    } catch(e){ setErr(e.message || 'Failed to load QA record'); }
    finally { setLoading(false); }
  }
  React.useEffect(()=>{ if(Number.isFinite(qaId)) load(); }, [qaId]);

  if (!Number.isFinite(qaId)) return <div className="p-4">Invalid QA id</div>;
  if (loading) return <div className="p-4 text-sm text-slate-600">Loading…</div>;
  if (err) return <div className="p-4 text-sm text-red-600">{err}</div>;
  if (!row) return <div className="p-4">Not found</div>;

  return (
    <div className="p-4 space-y-4">
      <EntityHeader
        title={row.title || `QA #${qaId}`}
        subtitle={row.reference || ''}
        entityType="qa/records"
        entityId={qaId}
        data={row}
        fields={[{ name:'type', label:'Type' }, { name:'status', label:'Status' }, { name:'trade', label:'Trade' }]}
        refresh={load}
      />
      <EntityDocuments entityType="qa" entityId={qaId} projectId={row.projectId} title="QA Documents" />
    </div>
  );
}
