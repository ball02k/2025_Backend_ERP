// lib/links.cjs
// Simple helpers to standardize link objects returned to FE.
// { type: 'project'|'client'|'supplier'|'package'|'rfx'|'po'|'invoice'|'variation'|'document', id: number|string, label: string, route: string }

function routeFor(link) {
  const id = link.id;
  switch (link.type) {
    case 'project':
      return `/projects/${id}/overview`;
    case 'client':
      return `/clients/${id}`;
    case 'supplier':
      return `/suppliers/${id}`;
    case 'package':
      return `/projects/${link.projectId}/packages/${id}`;
    case 'rfx':
      return `/rfx/${id}`;
    case 'po':
      return `/procurement/purchase-orders/${id}`;
    case 'variation':
      return `/projects/${link.projectId}/variations`;
    default:
      return '/';
  }
}

function linkOf(type, id, label, extras = {}) {
  const l = { type, id, label, ...extras };
  return { ...l, route: routeFor(l) };
}

module.exports = { linkOf };

