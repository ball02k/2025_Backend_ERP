import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiGet } from '@/lib/api';
import EntityHeader from '@/components/EntityHeader';

type Proj = Record<string, any> & { links?: any[] };

export default function ProjectInfo(){
  const { id } = useParams();
  const [overview, setOverview] = useState<{ project: Proj } | null>(null);

  async function load(){
    const data = await apiGet(`/api/projects/${id}/overview`);
    setOverview(data);
  }
  useEffect(()=>{ if(id) load(); }, [id]);

  if(!overview) return null;
  const proj = overview.project;

  return (
    <div className="space-y-4">
      <EntityHeader
        title={proj.name}
        subtitle={proj.code}
        entityType="projects"
        entityId={Number(id)}
        data={proj}
        links={overview.links || []}
        fields={[
          { name:'contractForm', label:'Contract Form' },
          { name:'country', label:'Country' },
          { name:'currency', label:'Currency' },
          { name:'unitSystem', label:'Units' },
        ]}
        refresh={load}
      />
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="border rounded-2xl p-4">
          <h3 className="font-semibold mb-2">Packages</h3>
          {(proj.packages || []).map((p: any) => (
            <Link key={p.id} className="block text-blue-700 hover:underline" to={`/projects/${id}/packages/${p.id}`}>{p.name}</Link>
          ))}
        </div>
        <div className="border rounded-2xl p-4">
          <h3 className="font-semibold mb-2">RFx</h3>
          {(proj.rfx || []).map((r: any) => (
            <Link key={r.id} className="block text-blue-700 hover:underline" to={`/rfx/${r.id}`}>{r.title}</Link>
          ))}
        </div>
      </section>
    </div>
  );
}

