import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiGet } from '@/lib/api';
import EntityHeader from '@/components/EntityHeader';
import EntityDocuments from '@/components/documents/EntityDocuments.jsx';

type Proj = Record<string, any> & { links?: any[] };

export default function ProjectInfo(){
  const { id } = useParams();
  // Keep a single state object to avoid changing hook order during HMR
  const [state, setState] = useState<{ project: Proj | null; links?: any[]; loading: boolean; error: string }>({ project: null, links: [], loading: true, error: '' });
  const [lookups, setLookups] = useState<{ statuses: string[]; types: string[] }>({ statuses: [], types: [] });
  const [pkgList, setPkgList] = useState<any[]>([]);
  const [rfx, setRfx] = useState<any[]>([]);

  async function load(){
    setState((s) => ({ ...s, loading: true, error: '' }));
    try {
      const data = await apiGet(`/api/projects/${id}/overview`);
      const proj = data?.project || data?.data || data;
      setState({ project: proj?.project || proj, links: data?.links || [], loading: false, error: '' });
    } catch (e: any) {
      // Fallback: fetch basic project payload so the page can still render
      try {
        const basic = await apiGet(`/api/projects/${id}`);
        const proj = basic?.project || basic?.data || basic;
        setState({ project: proj || null, links: [], loading: false, error: '' });
      } catch (e2: any) {
        setState({ project: null, links: [], loading: false, error: e2?.message || 'Failed to load project' });
      }
    }
  }
  useEffect(()=>{ if(id) load(); }, [id]);

  // Load Packages + Tenders explicitly so they are visible even if project payload doesn’t embed them
  useEffect(() => {
    async function fetchExtras() {
      if (!id) return;
      try {
        const pkgs = await apiGet(`/api/projects/${id}/packages`);
        const items = Array.isArray(pkgs?.items) ? pkgs.items : (Array.isArray(pkgs) ? pkgs : []);
        setPkgList(items);
      } catch { setPkgList([]); }
      try {
        const t = await apiGet(`/api/projects/${id}/rfx`);
        const items = Array.isArray(t?.items) ? t.items : (Array.isArray(t) ? t : []);
        setRfx(items);
      } catch { setRfx([]); }
    }
    fetchExtras();
  }, [id]);

  useEffect(() => {
    async function loadLookups(){
      try {
        const data = await apiGet<{ statuses: string[]; types: string[] }>(`/api/lookups/projects`);
        setLookups({
          statuses: Array.isArray(data?.statuses) ? data.statuses : [],
          types: Array.isArray(data?.types) ? data.types : [],
        });
      } catch (e) {
        setLookups({ statuses: [], types: [] });
      }
    }
    loadLookups();
  }, []);

  if (state.loading) return <div className="text-sm text-slate-500">Loading project…</div>;
  if (state.error) return <div className="text-sm text-red-600">{state.error}</div>;
  if(!state.project) return null;
  const proj = state.project;

  return (
    <div className="space-y-4">
      <EntityHeader
        title={proj.name}
        subtitle={proj.code}
        entityType="projects"
        entityId={Number(id)}
        data={proj}
        links={state.links || []}
        fields={[
          { name:'status', label:'Status', listId:'project-statuses', options: lookups.statuses },
          { name:'type', label:'Type', listId:'project-types', options: lookups.types },
          { name:'contractForm', label:'Contract Form' },
          { name:'country', label:'Country' },
          { name:'currency', label:'Currency' },
          { name:'unitSystem', label:'Units' },
        ]}
        refresh={load}
      />
      <div className="-mt-3 mb-2 flex items-center gap-4">
        <a href={`/projects/${id}/edit`} className="text-sm underline">Open edit form</a>
        <a href={`/projects/${id}/finance/invoices`} className="text-sm underline">Open Finance</a>
      </div>
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="border rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold">Packages</h3>
            <Link className="text-sm underline" to={`/projects/${id}/packages`}>Open list</Link>
          </div>
          {pkgList.length === 0 && <div className="text-sm text-slate-600">No packages yet.</div>}
          {pkgList.map((p: any) => (
            <Link key={p.id} className="block text-blue-700 hover:underline" to={`/projects/${id}/packages/${p.id}`}>{p.name}</Link>
          ))}
        </div>
        <div className="border rounded-2xl p-4">
          <h3 className="font-semibold mb-2">RFx</h3>
          {rfx.length === 0 && <div className="text-sm text-slate-600">No RFx yet.</div>}
          {rfx.map((r: any) => (
            <Link key={r.id} className="block text-blue-700 hover:underline" to={`/rfx/${r.id}`}>{r.title || `RFx #${r.id}`}</Link>
          ))}
        </div>
      </section>
      {/* Financial module moved to dedicated Finance area with submenu */}
      {/* Project Documents */}
      <EntityDocuments
        entityType="project"
        entityId={Number(id)}
        projectId={Number(id)}
        title="Project Documents"
      />
    </div>
  );
}
