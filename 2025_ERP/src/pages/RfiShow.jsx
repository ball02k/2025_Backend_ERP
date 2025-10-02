import React from 'react';
import { useParams } from 'react-router-dom';
import { apiGet } from '@/lib/api';
import EntityHeader from '@/components/EntityHeader';
import EntityDocuments from '@/components/documents/EntityDocuments.jsx';

export default function RfiShow(){
  const { id } = useParams();
  const rfiId = Number(id);
  const [row, setRow] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState('');

  async function load(){
    try {
      const res = await apiGet(`/api/rfis/${rfiId}`);
      const data = res?.data || res;
      setRow(data || null);
    } catch(e){ setErr(e.message || 'Failed to load RFI'); }
    finally { setLoading(false); }
  }
  React.useEffect(()=>{ if(Number.isFinite(rfiId)) load(); }, [rfiId]);

  if (!Number.isFinite(rfiId)) return <div className="p-4">Invalid RFI id</div>;
  if (loading) return <div className="p-4 text-sm text-slate-600">Loading…</div>;
  if (err) return <div className="p-4 text-sm text-red-600">{err}</div>;
  if (!row) return <div className="p-4">Not found</div>;

  return (
    <div className="p-4 space-y-4">
      <EntityHeader
        title={row.subject || `RFI #${rfiId}`}
        subtitle={row.rfiNumber || ''}
        entityType="rfis"
        entityId={rfiId}
        data={row}
        fields={[{ name:'status', label:'Status' }, { name:'priority', label:'Priority' }, { name:'discipline', label:'Discipline' }]}
        refresh={load}
      />
      <EntityDocuments entityType="rfi" entityId={rfiId} projectId={row.projectId} title="RFI Documents" />
    </div>
  );
}
