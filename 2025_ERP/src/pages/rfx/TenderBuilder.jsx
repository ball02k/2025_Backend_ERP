import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiDelete, apiGet, apiPatch, apiPost, toastErr, toastOk } from '@/lib/api';

function SectionRow({ section, onUpdate, onDelete, disabled }) {
  const [local, setLocal] = useState(section);
  useEffect(() => setLocal(section), [section]);

  return (
    <div className="flex items-center gap-3 p-3 border rounded-lg bg-white">
      <input
        className="input input-bordered flex-1"
        value={local.title}
        disabled={disabled}
        onChange={(e) => setLocal({ ...local, title: e.target.value })}
      />
      <input
        className="input input-bordered w-24"
        type="number"
        value={local.sortOrder}
        disabled={disabled}
        onChange={(e) => setLocal({ ...local, sortOrder: Number(e.target.value) })}
      />
      <button className="btn btn-sm" disabled={disabled} onClick={() => !disabled && onUpdate(local)}>
        Save
      </button>
      <button
        className="btn btn-sm btn-outline"
        disabled={disabled}
        onClick={() => !disabled && onDelete(section.id)}
      >
        Delete
      </button>
    </div>
  );
}

function QuestionRow({ q, sections, onUpdate, onDelete, disabled }) {
  const [local, setLocal] = useState(q);
  useEffect(() => setLocal(q), [q]);

  return (
    <div className="grid grid-cols-12 gap-3 p-3 border rounded-lg bg-white">
      <select
        className="col-span-2 select select-bordered"
        value={local.sectionId ?? ''}
        disabled={disabled}
        onChange={(e) =>
          setLocal({
            ...local,
            sectionId: e.target.value ? Number(e.target.value) : null,
          })
        }
      >
        <option value="">— No section —</option>
        {sections.map((s) => (
          <option key={s.id} value={s.id}>
            {s.title}
          </option>
        ))}
      </select>
      <input
        className="col-span-4 input input-bordered"
        placeholder="Question prompt"
        disabled={disabled}
        value={local.prompt}
        onChange={(e) => setLocal({ ...local, prompt: e.target.value })}
      />
      <input
        className="col-span-3 input input-bordered"
        placeholder="Guidance (optional)"
        disabled={disabled}
        value={local.guidance || ''}
        onChange={(e) => setLocal({ ...local, guidance: e.target.value })}
      />
      <select
        className="col-span-2 select select-bordered"
        disabled={disabled}
        value={local.responseType}
        onChange={(e) => setLocal({ ...local, responseType: e.target.value })}
      >
        <option>text</option>
        <option>number</option>
        <option>file</option>
        <option>multi</option>
        <option>single</option>
      </select>
      <div className="col-span-1 flex items-center gap-2">
        <input
          type="checkbox"
          className="checkbox"
          disabled={disabled}
          checked={!!local.required}
          onChange={(e) => setLocal({ ...local, required: e.target.checked })}
        />
        <span>Req</span>
      </div>
      <div className="col-span-12 flex flex-wrap gap-2">
        <input
          className="input input-bordered w-24"
          type="number"
          step="0.01"
          disabled={disabled}
          placeholder="Weight"
          value={local.weight ?? ''}
          onChange={(e) =>
            setLocal({
              ...local,
              weight: e.target.value ? Number(e.target.value) : null,
            })
          }
        />
        <input
          className="input input-bordered w-24"
          type="number"
          disabled={disabled}
          placeholder="Order"
          value={local.sortOrder}
          onChange={(e) => setLocal({ ...local, sortOrder: Number(e.target.value) })}
        />
        <input
          className="input input-bordered flex-1 min-w-[180px]"
          placeholder='Options JSON (e.g. ["A","B"] or {"accept":["pdf"]})'
          disabled={disabled}
          value={local.options || ''}
          onChange={(e) => setLocal({ ...local, options: e.target.value })}
        />
        <button className="btn btn-sm" disabled={disabled} onClick={() => !disabled && onUpdate(local)}>
          Save
        </button>
        <button
          className="btn btn-sm btn-outline"
          disabled={disabled}
          onClick={() => !disabled && onDelete(q.id)}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function CriteriaRow({ c, onUpdate, onDelete, disabled }) {
  const [local, setLocal] = useState(c);
  useEffect(() => setLocal(c), [c]);

  return (
    <div className="flex flex-wrap items-center gap-3 p-3 border rounded-lg bg-white">
      <input
        className="input input-bordered flex-1 min-w-[160px]"
        placeholder="Name"
        disabled={disabled}
        value={local.name}
        onChange={(e) => setLocal({ ...local, name: e.target.value })}
      />
      <select
        className="select select-bordered"
        disabled={disabled}
        value={local.type}
        onChange={(e) => setLocal({ ...local, type: e.target.value })}
      >
        <option>price</option>
        <option>technical</option>
        <option>programme</option>
        <option>h&s</option>
        <option>esg</option>
        <option>past</option>
        <option>risk</option>
      </select>
      <input
        className="input input-bordered w-24"
        type="number"
        step="0.01"
        disabled={disabled}
        value={local.weight}
        onChange={(e) => setLocal({ ...local, weight: Number(e.target.value) })}
      />
      <input
        className="input input-bordered flex-1 min-w-[160px]"
        placeholder="Config JSON"
        disabled={disabled}
        value={local.config || ''}
        onChange={(e) => setLocal({ ...local, config: e.target.value })}
      />
      <button className="btn btn-sm" disabled={disabled} onClick={() => !disabled && onUpdate(local)}>
        Save
      </button>
      <button
        className="btn btn-sm btn-outline"
        disabled={disabled}
        onClick={() => !disabled && onDelete(c.id)}
      >
        Delete
      </button>
    </div>
  );
}

const toArray = (maybe) => (Array.isArray(maybe) ? maybe : []);

export default function TenderBuilder() {
  const { rfxId } = useParams();
  const [request, setRequest] = useState(null);
  const [sections, setSections] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [criteria, setCriteria] = useState([]);
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [issuing, setIssuing] = useState(false);
  const [supplierOptions, setSupplierOptions] = useState([]);
  const [selectedSupplier, setSelectedSupplier] = useState('');

  const load = async () => {
    if (!rfxId) return;
    setLoading(true);
    try {
      const [reqRes, secs, qs, cs, inv] = await Promise.all([
        apiGet(`/api/requests/${rfxId}`),
        apiGet(`/rfx-builder/${rfxId}/sections`),
        apiGet(`/rfx-builder/${rfxId}/questions`),
        apiGet(`/rfx-builder/${rfxId}/criteria`),
        apiGet(`/rfx-builder/${rfxId}/invites`),
      ]);
      const reqRow = reqRes?.data || reqRes?.request || reqRes || null;
      setRequest(reqRow);
      setSections(toArray(secs));
      setQuestions(toArray(qs));
      setCriteria(toArray(cs));
      setInvites(toArray(inv));
    } catch (e) {
      toastErr(e, 'Failed to load tender builder');
      setRequest(null);
      setSections([]);
      setQuestions([]);
      setCriteria([]);
      setInvites([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [rfxId]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await apiGet('/api/suppliers', { limit: 200, offset: 0 });
        const list = res?.data || res?.items || res?.rows || res || [];
        if (alive) {
          setSupplierOptions(
            Array.isArray(list)
              ? list.map((s) => ({ id: s.id, name: s.name || `Supplier #${s.id}` }))
              : []
          );
        }
      } catch {
        if (alive) setSupplierOptions([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const locked = useMemo(() => {
    if (!request) return false;
    return (request.status || '').toLowerCase() !== 'draft';
  }, [request]);

  const totalWeight = useMemo(
    () => criteria.reduce((acc, c) => acc + Number(c.weight || 0), 0),
    [criteria]
  );

  const supplierLabel = (id) =>
    supplierOptions.find((opt) => Number(opt.id) === Number(id))?.name || `Supplier #${id}`;

  const addSection = async () => {
    if (locked) return;
    try {
      const row = await apiPost(`/rfx-builder/${rfxId}/sections`, {
        title: 'New Section',
        sortOrder: (sections.at(-1)?.sortOrder ?? 0) + 10,
      });
      setSections([...sections, row]);
    } catch (e) {
      toastErr(e, 'Failed to add section');
    }
  };

  const updateSection = async (m) => {
    if (locked) return;
    try {
      const row = await apiPatch(`/rfx-builder/sections/${m.id}`, m);
      setSections(sections.map((s) => (s.id === row.id ? row : s)));
    } catch (e) {
      toastErr(e, 'Failed to update section');
    }
  };

  const deleteSection = async (id) => {
    if (locked) return;
    try {
      await apiDelete(`/rfx-builder/sections/${id}`);
      setSections(sections.filter((s) => s.id !== id));
    } catch (e) {
      toastErr(e, 'Failed to delete section');
    }
  };

  const addQuestion = async () => {
    if (locked) return;
    try {
      const row = await apiPost(`/rfx-builder/${rfxId}/questions`, {
        prompt: 'New question',
        responseType: 'text',
        required: true,
        sortOrder: (questions.at(-1)?.sortOrder ?? 0) + 10,
      });
      setQuestions([...questions, row]);
    } catch (e) {
      toastErr(e, 'Failed to add question');
    }
  };

  const updateQuestion = async (m) => {
    if (locked) return;
    try {
      const row = await apiPatch(`/rfx-builder/questions/${m.id}`, m);
      setQuestions(questions.map((q) => (q.id === row.id ? row : q)));
    } catch (e) {
      toastErr(e, 'Failed to update question');
    }
  };

  const deleteQuestion = async (id) => {
    if (locked) return;
    try {
      await apiDelete(`/rfx-builder/questions/${id}`);
      setQuestions(questions.filter((q) => q.id !== id));
    } catch (e) {
      toastErr(e, 'Failed to delete question');
    }
  };

  const addCriterion = async () => {
    if (locked) return;
    try {
      const row = await apiPost(`/rfx-builder/${rfxId}/criteria`, {
        name: 'Price',
        type: 'price',
        weight: 50,
      });
      setCriteria([...criteria, row]);
    } catch (e) {
      toastErr(e, 'Failed to add criterion');
    }
  };

  const updateCriterion = async (m) => {
    if (locked) return;
    try {
      const row = await apiPatch(`/rfx-builder/criteria/${m.id}`, m);
      setCriteria(criteria.map((c) => (c.id === row.id ? row : c)));
    } catch (e) {
      toastErr(e, 'Failed to update criterion');
    }
  };

  const deleteCriterion = async (id) => {
    if (locked) return;
    try {
      await apiDelete(`/rfx-builder/criteria/${id}`);
      setCriteria(criteria.filter((c) => c.id !== id));
    } catch (e) {
      toastErr(e, 'Failed to delete criterion');
    }
  };

  const addInvite = async () => {
    if (locked || !selectedSupplier) return;
    try {
      const row = await apiPost(`/rfx-builder/${rfxId}/invites`, {
        supplierId: Number(selectedSupplier),
      });
      setInvites([...invites, row]);
      setSelectedSupplier('');
      toastOk('Invite added');
    } catch (e) {
      toastErr(e, 'Failed to add invite');
    }
  };

  const sendInvite = async (id) => {
    try {
      const row = await apiPost(`/rfx-builder/invites/${id}/send`, {});
      setInvites(invites.map((v) => (v.id === row.id ? row : v)));
      toastOk('Invite sent');
    } catch (e) {
      toastErr(e, 'Failed to send invite');
    }
  };

  const issueRfx = async () => {
    if (locked || issuing) return;
    try {
      setIssuing(true);
      const res = await apiPost(`/rfx-builder/${rfxId}/issue`, {});
      const updated = res?.request || request;
      if (updated) setRequest(updated);
      toastOk('Tender issued');
    } catch (e) {
      toastErr(e, 'Unable to issue tender');
    } finally {
      setIssuing(false);
    }
  };

  if (loading) return <div className="p-6">Loading…</div>;
  if (!request) return <div className="p-6 text-sm text-red-600">Tender not found.</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Tender Builder</h1>
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
              Status: {request.status || 'draft'}
            </span>
            {request.deadline && (
              <span>Deadline: {new Date(request.deadline).toLocaleDateString('en-GB')}</span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            className="btn btn-primary"
            disabled={locked || issuing}
            onClick={issueRfx}
          >
            {locked ? 'Tender Issued' : issuing ? 'Issuing…' : 'Issue Tender'}
          </button>
          <Link className="btn" to={`/rfx/${rfxId}`}>
            Back to RFx
          </Link>
        </div>
      </div>

      {locked && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          This tender has been issued. Builder edits are locked; invitations can still be sent from the list below.
        </div>
      )}

      {/* Sections */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Sections</h2>
          <button className="btn btn-sm" disabled={locked} onClick={addSection}>
            Add Section
          </button>
        </div>
        <div className="grid gap-3">
          {sections.map((s) => (
            <SectionRow
              key={s.id}
              section={s}
              onUpdate={updateSection}
              onDelete={deleteSection}
              disabled={locked}
            />
          ))}
          {!sections.length && (
            <div className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-500">
              No sections yet. Add sections to group your questions.
            </div>
          )}
        </div>
      </section>

      {/* Questions */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Questions</h2>
          <button className="btn btn-sm" disabled={locked} onClick={addQuestion}>
            Add Question
          </button>
        </div>
        <div className="grid gap-3">
          {questions.map((q) => (
            <QuestionRow
              key={q.id}
              q={q}
              sections={sections}
              onUpdate={updateQuestion}
              onDelete={deleteQuestion}
              disabled={locked}
            />
          ))}
          {!questions.length && (
            <div className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-500">
              Add questions to capture supplier responses and scoring inputs.
            </div>
          )}
        </div>
      </section>

      {/* Scoring */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Scoring Criteria</h2>
          <div className="text-sm opacity-70">Total weight: {totalWeight}%</div>
          <button className="btn btn-sm" disabled={locked} onClick={addCriterion}>
            Add Criterion
          </button>
        </div>
        <div className="grid gap-3">
          {criteria.map((c) => (
            <CriteriaRow
              key={c.id}
              c={c}
              onUpdate={updateCriterion}
              onDelete={deleteCriterion}
              disabled={locked}
            />
          ))}
          {!criteria.length && (
            <div className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-500">
              Define scoring criteria to balance price and technical weighting.
            </div>
          )}
        </div>
      </section>

      {/* Supplier Invites */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Supplier Invites</h2>
          <div className="flex items-center gap-2">
            <select
              className="select select-bordered min-w-[200px]"
              value={selectedSupplier}
              disabled={locked || !supplierOptions.length}
              onChange={(e) => setSelectedSupplier(e.target.value)}
            >
              <option value="">{supplierOptions.length ? 'Select supplier…' : 'Loading suppliers…'}</option>
              {supplierOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.name}
                </option>
              ))}
            </select>
            <button
              className="btn btn-sm"
              disabled={locked || !selectedSupplier}
              onClick={addInvite}
            >
              Add Invite
            </button>
          </div>
        </div>
        <div className="grid gap-3">
          {invites.map((v) => (
            <div
              key={v.id}
              className="flex flex-wrap items-center justify-between gap-3 p-3 border rounded-lg bg-white"
            >
              <div>
                <div className="font-medium">{supplierLabel(v.supplierId)}</div>
                <div className="text-sm opacity-70">Status: {v.status}</div>
                {v.token && <div className="text-xs opacity-60">Token: {v.token}</div>}
                {v.sentAt && (
                  <div className="text-xs opacity-60">
                    Sent: {new Date(v.sentAt).toLocaleString('en-GB', { timeZone: 'Europe/London' })}
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                {v.status === 'draft' && (
                  <button className="btn btn-sm" onClick={() => sendInvite(v.id)}>
                    Send
                  </button>
                )}
              </div>
            </div>
          ))}
          {!invites.length && (
            <div className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-500">
              Add suppliers to invite them once the tender is issued.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
