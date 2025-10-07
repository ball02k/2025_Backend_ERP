function pathFor(type, ids = {}) {
  const { id, projectId } = ids || {};
  switch (type) {
    case 'project': return `/projects/${id}`;
    case 'package': return projectId ? `/projects/${projectId}/packages/${id}` : `/packages/${id}`;
    case 'contract': return `/contracts/${id}`;
    case 'budget': return `/projects/${projectId}/budget`;
    case 'client': return `/clients/${id}`;
    case 'contact': return `/contacts/${id}`;
    case 'user': return `/users/${id}`;
    case 'supplier': return `/suppliers/${id}`;
    case 'package': return `/packages/${id}`;
    case 'contract': return `/contracts/${id}`;
    case 'po': return `/financial/pos/${id}`;
    case 'invoice': return projectId ? `/projects/${projectId}/financials/invoices/${id}` : `/financial/invoices/${id}`;
    case 'variation': return `/variations/${id}`;
    case 'afp': return projectId ? `/projects/${projectId}/financials/afp/${id}` : `/financial/afp/${id}`;
    case 'cvr': return projectId ? `/projects/${projectId}/financials/cvr/${id}` : `/financial/cvr/${id}`;
    case 'document': return `/documents/${id}`;
    default: return '/';
  }
}

function labelFor(type, obj) {
  const cand = obj?.number || obj?.code || obj?.ref || obj?.reference || obj?.name || obj?.email || `#${obj?.id ?? ''}`;
  return String(cand ?? '');
}

function link(type, obj = {}, extras = {}) {
  const ids = { id: obj?.id ?? extras.id, projectId: extras.projectId ?? obj?.projectId };
  return { type, id: ids.id, href: pathFor(type, ids), label: labelFor(type, obj) };
}

function buildLinks(entityName, e) {
  const L = [];
  if (entityName === 'project') {
    if (e.client) L.push(link('client', e.client));
  }
  if (entityName === 'projectInfo' || entityName === 'project') {
    if (e.clientId) L.push(link('client', { id: e.clientId, name: e.client?.name }));
    if (e.clientContactId) L.push(link('contact', { id: e.clientContactId, name: e.clientContact?.name, email: e.clientContact?.email }));
    if (e.projectManagerUserId) L.push(link('user', { id: e.projectManagerUserId, name: e.projectManager?.name }));
    if (e.quantitySurveyorUserId) L.push(link('user', { id: e.quantitySurveyorUserId, name: e.quantitySurveyor?.name }));
  }
  if (entityName === 'invoice') {
    if (e.project) L.push(link('project', e.project));
    if (e.supplier) L.push(link('supplier', e.supplier));
    if (e.po) L.push(link('po', e.po));
    if (e.afp) L.push(link('afp', e.afp, { projectId: e.projectId }));
  }
  if (entityName === 'po') {
    if (e.project) L.push(link('project', e.project));
    if (e.supplier) L.push(link('supplier', e.supplier));
    if (e.package) L.push(link('package', e.package));
    if (e.contract) L.push(link('contract', e.contract));
  }
  if (entityName === 'variation') {
    if (e.project) {
      L.push(link('project', e.project));
    } else if (e.projectId) {
      L.push(link('project', { id: e.projectId }));
    }
    if (e.package) {
      L.push(link('package', e.package));
    } else if (e.packageId) {
      L.push(link('package', { id: e.packageId }));
    }
    if (e.contract) {
      L.push(link('contract', e.contract));
    } else if (e.contractId) {
      L.push(link('contract', { id: e.contractId }));
    }
    if (e.budgetLineId) {
      L.push(link('budget', { id: e.budgetLineId, projectId: e.projectId || e.project?.id }));
    }
    if (e.cvr) L.push(link('cvr', e.cvr, { projectId: e.projectId }));
  }
  if (entityName === 'afp') {
    if (e.project) L.push(link('project', e.project));
    if (e.invoice) L.push(link('invoice', e.invoice, { projectId: e.projectId }));
  }
  if (entityName === 'cvr') {
    if (e.project) L.push(link('project', e.project));
  }
  if (entityName === 'cvrLine') {
    if (e.projectId) L.push(link('project', { id: e.projectId }));
    if (e.packageId) L.push(link('package', { id: e.packageId, projectId: e.projectId }));
    if (e.budgetLineId) L.push(link('budget', { id: e.budgetLineId, projectId: e.projectId }));
    if (e.contractId) L.push(link('contract', { id: e.contractId }));
  }
  if (entityName === 'contract') {
    if (e.project) L.push(link('project', e.project));
    if (e.package) L.push(link('package', e.package));
    if (e.supplier) L.push(link('supplier', e.supplier));
  }
  if (entityName === 'package') {
    if (e.project) L.push(link('project', e.project));
    if (e.supplier) L.push(link('supplier', e.supplier));
  }
  if (entityName === 'document') {
    if (e.projectId) L.push(link('project', { id: e.projectId }));
    if (e.variationId) L.push(link('variation', { id: e.variationId }));
  }
  return L;
}

module.exports = { buildLinks };
