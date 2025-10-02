import React from 'react';
import { useParams } from 'react-router-dom';
import { apiGet } from '@/lib/api';
import EntityHeader from '@/components/EntityHeader';
import EntityDocuments from '@/components/documents/EntityDocuments.jsx';

export default function CarbonShow(){
  const { id } = useParams();
  const carbonId = Number(id);
  const [row, setRow] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState('');

  async function load(){
    try {
      const res = await apiGet(`/api/carbon/entries/${carbonId}`);
      const data = res?.data || res;
      setRow(data || null);
    } catch(e){ setErr(e.message || 'Failed to load Carbon entry'); }
    finally { setLoading(false); }
  }
  React.useEffect(()=>{ if(Number.isFinite(carbonId)) load(); }, [carbonId]);

  if (!Number.isFinite(carbonId)) return <div className="p-4">Invalid Carbon Entry id</div>;
  if (loading) return <div className="p-4 text-sm text-slate-600">Loading…</div>;
  if (err) return <div className="p-4 text-sm text-red-600">{err}</div>;
  if (!row) return <div className="p-4">Not found</div>;

  return (
    <div className="p-4 space-y-4">
      <EntityHeader
        title={row.category || `Carbon #${carbonId}`}
        subtitle={row.scope || ''}
        entityType="carbon/entries"
        entityId={carbonId}
        data={row}
        fields={[
          { name:'activityDate', label:'Date' },
          { name:'quantity', label:'Qty' },
          { name:'unit', label:'Unit' },
          { name:'emissionFactor', label:'EF' },
          { name:'calculatedKgCO2e', label:'kgCO2e' },
        ]}
        refresh={load}
      />
      <EntityDocuments entityType="carbon" entityId={carbonId} projectId={row.projectId} title="Carbon Documents" />
    </div>
  );
}
