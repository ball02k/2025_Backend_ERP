const express = require('express');
const prisma = require('../lib/prisma.cjs');

const router = express.Router();

function tenantId(req) {
  return req.user?.tenantId || 'demo';
}

function actorId(req) {
  return req.user?.id || req.user?.userId || null;
}

function toProjectId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function csvList(value) {
  if (!value) return [];
  return String(value).split(',').map((item) => item.trim()).filter(Boolean);
}

function pageOptions(query) {
  const page = Math.max(1, Number(query.page || 1));
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize || query.limit || 25)));
  return { pageSize, skip: (page - 1) * pageSize };
}

async function ensureProjectAccess(req, res, projectId) {
  const exists = await prisma.project.count({
    where: { id: projectId, tenantId: tenantId(req) },
  });
  if (!exists) {
    res.status(404).json({ error: 'Project not found' });
    return false;
  }
  return true;
}

async function writeProjectAudit(req, entity, entityId, action, changes = {}) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: actorId(req) ? Number(actorId(req)) : null,
        entity,
        entityId: String(entityId),
        action,
        changes: { tenantId: tenantId(req), ...changes },
        ipAddress: req.ip || null,
      },
    });
  } catch (_) {
    // Best-effort only; a logging issue must not break the project workflow.
  }
}

const supplierSelect = {
  id: true,
  name: true,
  status: true,
  performanceScore: true,
  insuranceExpiry: true,
  hsAccreditations: true,
  capabilities: { select: { tag: true } },
};

function toNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function tidyText(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const text = String(value).trim();
  return text || null;
}

function supplierPayload(supplier) {
  if (!supplier) return null;
  const capabilityTags = Array.isArray(supplier.capabilities) ? supplier.capabilities.map((item) => item.tag).filter(Boolean) : [];
  return {
    id: supplier.id,
    name: supplier.name,
    status: supplier.status,
    rating: supplier.performanceScore == null ? null : Number(supplier.performanceScore),
    insuranceValid: supplier.insuranceExpiry ? new Date(supplier.insuranceExpiry) > new Date() : false,
    insuranceExpiry: supplier.insuranceExpiry || null,
    accreditations: supplier.hsAccreditations
      ? String(supplier.hsAccreditations).split(',').map((item) => item.trim()).filter(Boolean)
      : [],
    capabilityTags,
    category: capabilityTags.find((tag) => tag.toLowerCase().startsWith('category:'))?.split(':', 2)?.[1] || null,
  };
}

function makeSupplierRollup(map, supplierId, supplier, fallbackName) {
  const key = supplierId ? String(supplierId) : `unlinked:${fallbackName || 'unknown'}`;
  if (!map.has(key)) {
    const payload = supplierPayload(supplier);
    map.set(key, {
      key,
      supplierId: supplierId || null,
      supplier: payload,
      name: payload?.name || fallbackName || 'Unlinked supplier',
      status: payload?.status || null,
      rating: payload?.rating ?? null,
      insuranceValid: payload?.insuranceValid ?? false,
      accreditations: payload?.accreditations || [],
      capabilityTags: payload?.capabilityTags || [],
      category: payload?.category || null,
      projectSupplierId: null,
      relationshipStatus: null,
      trade: null,
      role: null,
      notes: null,
      source: null,
      sources: new Set(),
      counts: {
        manual: 0,
        contracts: 0,
        purchaseOrders: 0,
        invoices: 0,
        paymentApplications: 0,
        tenderInvites: 0,
        tenderResponses: 0,
        tenderBids: 0,
        awards: 0,
      },
      totals: {
        contractValue: 0,
        purchaseOrderTotal: 0,
        invoiceGross: 0,
        paymentApplied: 0,
        awardValue: 0,
      },
      links: {
        supplier: supplierId ? `/suppliers/${supplierId}` : null,
        contracts: [],
        purchaseOrders: [],
        invoices: [],
        paymentApplications: [],
        tenders: [],
        awards: [],
      },
      latestActivityAt: null,
    });
  }
  return map.get(key);
}

function touchSupplier(row, source, date) {
  if (source) row.sources.add(source);
  if (!date) return;
  const current = row.latestActivityAt ? new Date(row.latestActivityAt) : null;
  const incoming = new Date(date);
  if (!current || incoming > current) row.latestActivityAt = incoming.toISOString();
}

async function getSuppliersById(req, ids) {
  const uniqueIds = Array.from(new Set(ids.filter((id) => Number.isInteger(Number(id))).map((id) => Number(id))));
  if (!uniqueIds.length) return new Map();
  const suppliers = await prisma.supplier.findMany({
    where: { tenantId: tenantId(req), id: { in: uniqueIds } },
    select: supplierSelect,
  });
  return new Map(suppliers.map((supplier) => [supplier.id, supplier]));
}

async function projectSupplierRows(req, projectId) {
  const [packages, tenders] = await Promise.all([
    prisma.package.findMany({ where: { projectId }, select: { id: true, name: true, trade: true } }),
    prisma.tender.findMany({ where: { tenantId: tenantId(req), projectId }, select: { id: true, title: true, status: true, packageId: true, updatedAt: true, createdAt: true } }),
  ]);
  const packageIds = packages.map((item) => item.id);
  const tenderIds = tenders.map((item) => item.id);
  const tenderById = new Map(tenders.map((item) => [item.id, item]));
  const packageById = new Map(packages.map((item) => [item.id, item]));

  const [
    manual,
    contracts,
    purchaseOrders,
    invoices,
    applications,
    awards,
    tenderInvites,
    tenderResponses,
    tenderSubmissions,
    tenderBids,
    legacyInvites,
    legacySubmissions,
  ] = await Promise.all([
    prisma.projectSupplier.findMany({ where: { tenantId: tenantId(req), projectId, isDeleted: false }, orderBy: { updatedAt: 'desc' } }),
    prisma.contract.findMany({
      where: { tenantId: tenantId(req), projectId },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, title: true, contractRef: true, status: true, value: true, supplierId: true, packageId: true, updatedAt: true, supplier: { select: supplierSelect } },
    }),
    prisma.purchaseOrder.findMany({
      where: { tenantId: tenantId(req), projectId },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, code: true, supplier: true, supplierId: true, status: true, total: true, updatedAt: true },
    }),
    prisma.invoice.findMany({
      where: { tenantId: tenantId(req), projectId },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, number: true, supplierId: true, status: true, gross: true, dueDate: true, updatedAt: true, supplier: { select: supplierSelect } },
    }),
    prisma.applicationForPayment.findMany({
      where: { tenantId: tenantId(req), projectId },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, applicationNo: true, supplierId: true, status: true, claimedThisPeriod: true, certifiedThisPeriod: true, updatedAt: true, supplier: { select: supplierSelect } },
    }),
    prisma.award.findMany({
      where: { tenantId: tenantId(req), projectId },
      orderBy: { awardDate: 'desc' },
      select: { id: true, supplierId: true, packageId: true, awardValue: true, awardDate: true, supplier: { select: supplierSelect } },
    }),
    tenderIds.length
      ? prisma.tenderSupplierInvite.findMany({
          where: { tenantId: tenantId(req), tenderId: { in: tenderIds } },
          select: { id: true, tenderId: true, supplierId: true, status: true, createdAt: true, supplier: { select: supplierSelect } },
        })
      : [],
    tenderIds.length
      ? prisma.tenderResponse.findMany({
          where: { tenantId: tenantId(req), tenderId: { in: tenderIds } },
          select: { id: true, tenderId: true, supplierId: true, priceTotal: true, status: true, submittedAt: true, supplier: { select: supplierSelect } },
        })
      : [],
    tenderIds.length
      ? prisma.tenderSubmission.findMany({
          where: { tenantId: tenantId(req), tenderId: { in: tenderIds } },
          select: { id: true, tenderId: true, supplierId: true, status: true, totalPrice: true, submittedAt: true, createdAt: true, supplier: { select: supplierSelect } },
        })
      : [],
    tenderIds.length
      ? prisma.tenderBid.findMany({
          where: { tenantId: tenantId(req), tenderId: { in: tenderIds } },
          select: { id: true, tenderId: true, supplierId: true, price: true, createdAt: true },
        })
      : [],
    packageIds.length
      ? prisma.tenderInvite.findMany({
          where: { packageId: { in: packageIds } },
          select: { id: true, packageId: true, supplierId: true, status: true, invitedAt: true, supplier: { select: supplierSelect } },
        })
      : [],
    packageIds.length
      ? prisma.submission.findMany({
          where: { packageId: { in: packageIds } },
          select: { id: true, packageId: true, supplierId: true, status: true, price: true, submittedAt: true, supplier: { select: supplierSelect } },
        })
      : [],
  ]);

  const includedSuppliers = new Map();
  for (const item of [...contracts, ...invoices, ...applications, ...awards, ...tenderInvites, ...tenderResponses, ...tenderSubmissions, ...legacyInvites, ...legacySubmissions]) {
    if (item.supplier) includedSuppliers.set(item.supplier.id, item.supplier);
  }
  const missingSupplierIds = [
    ...manual.map((item) => item.supplierId),
    ...purchaseOrders.map((item) => item.supplierId),
    ...tenderBids.map((item) => item.supplierId),
  ].filter((id) => id && !includedSuppliers.has(Number(id)));
  const extraSuppliers = await getSuppliersById(req, missingSupplierIds);
  for (const [id, supplier] of extraSuppliers.entries()) includedSuppliers.set(id, supplier);

  const rows = new Map();
  for (const item of manual) {
    const supplier = includedSuppliers.get(item.supplierId);
    const row = makeSupplierRollup(rows, item.supplierId, supplier, null);
    row.projectSupplierId = item.id;
    row.relationshipStatus = item.status;
    row.trade = item.trade;
    row.role = item.role;
    row.notes = item.notes;
    row.source = item.source;
    row.counts.manual += 1;
    touchSupplier(row, 'manual', item.updatedAt);
  }

  for (const item of contracts) {
    const row = makeSupplierRollup(rows, item.supplierId, item.supplier, null);
    row.counts.contracts += 1;
    row.totals.contractValue += toNumber(item.value);
    row.links.contracts.push({ id: item.id, label: item.contractRef || item.title || `Contract ${item.id}`, status: item.status, href: `/contracts/${item.id}` });
    touchSupplier(row, 'contract', item.updatedAt);
  }

  for (const item of purchaseOrders) {
    const row = makeSupplierRollup(rows, item.supplierId, includedSuppliers.get(item.supplierId), item.supplier);
    row.counts.purchaseOrders += 1;
    row.totals.purchaseOrderTotal += toNumber(item.total);
    row.links.purchaseOrders.push({ id: item.id, label: item.code || `PO ${item.id}`, status: item.status, href: `/projects/${projectId}/finance/purchase-orders` });
    touchSupplier(row, 'purchase_order', item.updatedAt);
  }

  for (const item of invoices) {
    const row = makeSupplierRollup(rows, item.supplierId, item.supplier, null);
    row.counts.invoices += 1;
    row.totals.invoiceGross += toNumber(item.gross);
    row.links.invoices.push({ id: item.id, label: item.number || `Invoice ${item.id}`, status: item.status, href: `/projects/${projectId}/finance/invoices` });
    touchSupplier(row, 'invoice', item.updatedAt || item.dueDate);
  }

  for (const item of applications) {
    const row = makeSupplierRollup(rows, item.supplierId, item.supplier, null);
    row.counts.paymentApplications += 1;
    row.totals.paymentApplied += toNumber(item.certifiedThisPeriod ?? item.claimedThisPeriod);
    row.links.paymentApplications.push({ id: item.id, label: item.applicationNo || `Application ${item.id}`, status: item.status, href: `/projects/${projectId}/finance/applications` });
    touchSupplier(row, 'payment_application', item.updatedAt);
  }

  for (const item of awards) {
    const row = makeSupplierRollup(rows, item.supplierId, item.supplier, null);
    const pkg = packageById.get(item.packageId);
    row.counts.awards += 1;
    row.totals.awardValue += toNumber(item.awardValue);
    row.links.awards.push({ id: item.id, label: pkg?.name || `Award ${item.id}`, status: 'awarded', href: `/projects/${projectId}/packages` });
    touchSupplier(row, 'award', item.awardDate);
  }

  for (const item of tenderInvites) {
    const tender = tenderById.get(item.tenderId);
    const row = makeSupplierRollup(rows, item.supplierId, item.supplier, null);
    row.counts.tenderInvites += 1;
    row.links.tenders.push({ id: item.tenderId, label: tender?.title || `Tender ${item.tenderId}`, status: item.status, href: `/projects/${projectId}/tenders/${item.tenderId}` });
    touchSupplier(row, 'tender_invite', item.createdAt);
  }

  for (const item of tenderResponses) {
    const tender = tenderById.get(item.tenderId);
    const row = makeSupplierRollup(rows, item.supplierId, item.supplier, null);
    row.counts.tenderResponses += 1;
    row.links.tenders.push({ id: item.tenderId, label: tender?.title || `Tender ${item.tenderId}`, status: item.status || 'responded', href: `/projects/${projectId}/tenders/${item.tenderId}` });
    touchSupplier(row, 'tender_response', item.submittedAt);
  }

  for (const item of tenderSubmissions) {
    const tender = tenderById.get(item.tenderId);
    const row = makeSupplierRollup(rows, item.supplierId, item.supplier, null);
    row.counts.tenderResponses += 1;
    row.links.tenders.push({ id: item.tenderId, label: tender?.title || `Tender ${item.tenderId}`, status: item.status || 'submitted', href: `/projects/${projectId}/tenders/${item.tenderId}` });
    touchSupplier(row, 'tender_submission', item.submittedAt || item.createdAt);
  }

  for (const item of tenderBids) {
    const tender = tenderById.get(item.tenderId);
    const row = makeSupplierRollup(rows, item.supplierId, includedSuppliers.get(item.supplierId), null);
    row.counts.tenderBids += 1;
    row.links.tenders.push({ id: item.tenderId, label: tender?.title || `Tender ${item.tenderId}`, status: 'bid', href: `/projects/${projectId}/tenders/${item.tenderId}` });
    touchSupplier(row, 'tender_bid', item.createdAt);
  }

  for (const item of legacyInvites) {
    const pkg = packageById.get(item.packageId);
    const row = makeSupplierRollup(rows, item.supplierId, item.supplier, null);
    row.counts.tenderInvites += 1;
    row.links.tenders.push({ id: `pkg-${item.packageId}`, label: pkg?.name || `Package ${item.packageId}`, status: item.status, href: `/projects/${projectId}/packages/${item.packageId}` });
    touchSupplier(row, 'package_invite', item.invitedAt);
  }

  for (const item of legacySubmissions) {
    const pkg = packageById.get(item.packageId);
    const row = makeSupplierRollup(rows, item.supplierId, item.supplier, null);
    row.counts.tenderResponses += 1;
    row.links.tenders.push({ id: `pkg-${item.packageId}`, label: pkg?.name || `Package ${item.packageId}`, status: item.status || 'submitted', href: `/projects/${projectId}/packages/${item.packageId}` });
    touchSupplier(row, 'package_submission', item.submittedAt);
  }

  return Array.from(rows.values()).map((row) => ({
    ...row,
    sources: Array.from(row.sources),
  })).sort((a, b) => {
    const dateA = a.latestActivityAt ? new Date(a.latestActivityAt).getTime() : 0;
    const dateB = b.latestActivityAt ? new Date(b.latestActivityAt).getTime() : 0;
    return dateB - dateA || String(a.name).localeCompare(String(b.name));
  });
}

router.get('/projects/:projectId/suppliers', async (req, res, next) => {
  try {
    const projectId = toProjectId(req.params.projectId);
    if (!projectId) return res.status(400).json({ error: 'Invalid projectId' });
    if (!(await ensureProjectAccess(req, res, projectId))) return;
    const items = await projectSupplierRows(req, projectId);
    res.json({ items, data: items, total: items.length });
  } catch (error) {
    next(error);
  }
});

router.post('/projects/:projectId/suppliers', async (req, res, next) => {
  try {
    const projectId = toProjectId(req.params.projectId);
    if (!projectId) return res.status(400).json({ error: 'Invalid projectId' });
    if (!(await ensureProjectAccess(req, res, projectId))) return;
    const supplierId = Number(req.body?.supplierId);
    if (!Number.isInteger(supplierId) || supplierId <= 0) return res.status(400).json({ error: 'supplierId is required' });
    const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, tenantId: tenantId(req) }, select: { id: true } });
    if (!supplier) return res.status(404).json({ error: 'Supplier not found' });

    const data = {
      status: tidyText(req.body.status) || 'active',
      trade: tidyText(req.body.trade),
      role: tidyText(req.body.role),
      source: tidyText(req.body.source) || 'manual',
      notes: tidyText(req.body.notes),
      updatedByUserId: actorId(req) ? String(actorId(req)) : null,
      isDeleted: false,
    };
    const existing = await prisma.projectSupplier.findFirst({ where: { tenantId: tenantId(req), projectId, supplierId } });
    const saved = existing
      ? await prisma.projectSupplier.update({ where: { id: existing.id }, data })
      : await prisma.projectSupplier.create({
          data: {
            tenantId: tenantId(req),
            projectId,
            supplierId,
            ...data,
            createdByUserId: actorId(req) ? String(actorId(req)) : null,
          },
        });
    await writeProjectAudit(req, 'ProjectSupplier', saved.id, existing ? 'update' : 'create', { projectId, supplierId, after: saved });
    res.status(existing ? 200 : 201).json(saved);
  } catch (error) {
    next(error);
  }
});

router.patch('/projects/:projectId/suppliers/:supplierId', async (req, res, next) => {
  try {
    const projectId = toProjectId(req.params.projectId);
    const supplierId = Number(req.params.supplierId);
    if (!projectId || !Number.isInteger(supplierId)) return res.status(400).json({ error: 'Invalid id' });
    if (!(await ensureProjectAccess(req, res, projectId))) return;
    const data = { updatedByUserId: actorId(req) ? String(actorId(req)) : null };
    for (const key of ['status', 'trade', 'role', 'source', 'notes']) {
      if (req.body[key] !== undefined) data[key] = tidyText(req.body[key]);
    }
    const result = await prisma.projectSupplier.updateMany({
      where: { tenantId: tenantId(req), projectId, supplierId, isDeleted: false },
      data,
    });
    if (!result.count) return res.status(404).json({ error: 'Project supplier link not found' });
    const updated = await prisma.projectSupplier.findFirst({ where: { tenantId: tenantId(req), projectId, supplierId, isDeleted: false } });
    await writeProjectAudit(req, 'ProjectSupplier', updated.id, 'update', { projectId, supplierId, set: data });
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

router.delete('/projects/:projectId/suppliers/:supplierId', async (req, res, next) => {
  try {
    const projectId = toProjectId(req.params.projectId);
    const supplierId = Number(req.params.supplierId);
    if (!projectId || !Number.isInteger(supplierId)) return res.status(400).json({ error: 'Invalid id' });
    if (!(await ensureProjectAccess(req, res, projectId))) return;
    const result = await prisma.projectSupplier.updateMany({
      where: { tenantId: tenantId(req), projectId, supplierId, isDeleted: false },
      data: { isDeleted: true, updatedByUserId: actorId(req) ? String(actorId(req)) : null },
    });
    if (!result.count) return res.status(404).json({ error: 'Project supplier link not found' });
    await writeProjectAudit(req, 'ProjectSupplier', supplierId, 'delete', { projectId, supplierId, softDelete: true });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

function riskWhere(req, projectId) {
  const category = csvList(req.query.category);
  const probability = csvList(req.query.probability);
  const impact = csvList(req.query.impact);
  const status = csvList(req.query.status);
  const owner = csvList(req.query.owner);
  const search = String(req.query.search || '').trim();
  return {
    tenantId: tenantId(req),
    projectId,
    isDeleted: false,
    ...(category.length ? { category: { in: category } } : {}),
    ...(probability.length ? { probability: { in: probability } } : {}),
    ...(impact.length ? { impact: { in: impact } } : {}),
    ...(status.length ? { status: { in: status } } : {}),
    ...(owner.length ? { owner: { in: owner } } : {}),
    ...(search
      ? {
          OR: [
            { title: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
            { mitigation: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
}

router.get('/projects/:projectId/risks', async (req, res, next) => {
  try {
    const projectId = toProjectId(req.params.projectId);
    if (!projectId) return res.status(400).json({ error: 'Invalid projectId' });
    if (!(await ensureProjectAccess(req, res, projectId))) return;
    const { pageSize, skip } = pageOptions(req.query);
    const where = riskWhere(req, projectId);
    const [items, total] = await Promise.all([
      prisma.projectRisk.findMany({ where, orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }], take: pageSize, skip }),
      prisma.projectRisk.count({ where }),
    ]);
    res.json({ items, total });
  } catch (error) {
    next(error);
  }
});

router.post('/projects/:projectId/risks', async (req, res, next) => {
  try {
    const projectId = toProjectId(req.params.projectId);
    if (!projectId) return res.status(400).json({ error: 'Invalid projectId' });
    if (!(await ensureProjectAccess(req, res, projectId))) return;
    if (!req.body?.title) return res.status(400).json({ error: 'Title is required' });
    const created = await prisma.projectRisk.create({
      data: {
        tenantId: tenantId(req),
        projectId,
        title: String(req.body.title),
        description: req.body.description || null,
        category: req.body.category || 'technical',
        probability: req.body.probability || 'medium',
        impact: req.body.impact || 'medium',
        status: req.body.status || 'identified',
        mitigation: req.body.mitigation || null,
        owner: req.body.owner || null,
      },
    });
    await writeProjectAudit(req, 'ProjectRisk', created.id, 'create', { projectId, after: created });
    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
});

router.patch('/projects/:projectId/risks/:riskId', async (req, res, next) => {
  try {
    const projectId = toProjectId(req.params.projectId);
    const riskId = Number(req.params.riskId);
    if (!projectId || !Number.isInteger(riskId)) return res.status(400).json({ error: 'Invalid id' });
    if (!(await ensureProjectAccess(req, res, projectId))) return;
    const data = {};
    for (const key of ['title', 'description', 'category', 'probability', 'impact', 'status', 'mitigation', 'owner']) {
      if (req.body[key] !== undefined) data[key] = req.body[key];
    }
    const result = await prisma.projectRisk.updateMany({
      where: { id: riskId, tenantId: tenantId(req), projectId, isDeleted: false },
      data,
    });
    if (!result.count) return res.status(404).json({ error: 'Risk not found' });
    const updated = await prisma.projectRisk.findFirst({ where: { id: riskId, tenantId: tenantId(req), projectId } });
    await writeProjectAudit(req, 'ProjectRisk', riskId, 'update', { projectId, set: data });
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

router.delete('/projects/:projectId/risks/:riskId', async (req, res, next) => {
  try {
    const projectId = toProjectId(req.params.projectId);
    const riskId = Number(req.params.riskId);
    if (!projectId || !Number.isInteger(riskId)) return res.status(400).json({ error: 'Invalid id' });
    if (!(await ensureProjectAccess(req, res, projectId))) return;
    const result = await prisma.projectRisk.updateMany({
      where: { id: riskId, tenantId: tenantId(req), projectId, isDeleted: false },
      data: { isDeleted: true },
    });
    if (!result.count) return res.status(404).json({ error: 'Risk not found' });
    await writeProjectAudit(req, 'ProjectRisk', riskId, 'delete', { projectId, softDelete: true });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

function approvalWhere(req, projectId) {
  const type = csvList(req.query.type);
  const status = csvList(req.query.status);
  const priority = csvList(req.query.priority);
  const approver = csvList(req.query.approver);
  const search = String(req.query.search || '').trim();
  return {
    tenantId: tenantId(req),
    projectId,
    isDeleted: false,
    ...(type.length ? { type: { in: type } } : {}),
    ...(status.length ? { status: { in: status } } : {}),
    ...(priority.length ? { priority: { in: priority } } : {}),
    ...(approver.length ? { approver: { in: approver } } : {}),
    ...(search
      ? {
          OR: [
            { title: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
            { requester: { contains: search, mode: 'insensitive' } },
            { approver: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
}

router.get('/projects/:projectId/approvals', async (req, res, next) => {
  try {
    const projectId = toProjectId(req.params.projectId);
    if (!projectId) return res.status(400).json({ error: 'Invalid projectId' });
    if (!(await ensureProjectAccess(req, res, projectId))) return;
    const { pageSize, skip } = pageOptions(req.query);
    const where = approvalWhere(req, projectId);
    const [items, total] = await Promise.all([
      prisma.projectApprovalRequest.findMany({ where, orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }], take: pageSize, skip }),
      prisma.projectApprovalRequest.count({ where }),
    ]);
    res.json({ items, total });
  } catch (error) {
    next(error);
  }
});

router.post('/projects/:projectId/approvals', async (req, res, next) => {
  try {
    const projectId = toProjectId(req.params.projectId);
    if (!projectId) return res.status(400).json({ error: 'Invalid projectId' });
    if (!(await ensureProjectAccess(req, res, projectId))) return;
    if (!req.body?.title) return res.status(400).json({ error: 'Title is required' });
    const created = await prisma.projectApprovalRequest.create({
      data: {
        tenantId: tenantId(req),
        projectId,
        title: String(req.body.title),
        description: req.body.description || null,
        type: req.body.type || 'document',
        status: req.body.status || 'pending',
        priority: req.body.priority || 'normal',
        amount: req.body.amount == null || req.body.amount === '' ? null : req.body.amount,
        requester: req.body.requester || null,
        approver: req.body.approver || null,
      },
    });
    await writeProjectAudit(req, 'ProjectApprovalRequest', created.id, 'create', { projectId, after: created });
    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
});

router.patch('/projects/:projectId/approvals/:approvalId', async (req, res, next) => {
  try {
    const projectId = toProjectId(req.params.projectId);
    const approvalId = Number(req.params.approvalId);
    if (!projectId || !Number.isInteger(approvalId)) return res.status(400).json({ error: 'Invalid id' });
    if (!(await ensureProjectAccess(req, res, projectId))) return;
    const data = {};
    for (const key of ['title', 'description', 'type', 'status', 'priority', 'amount', 'requester', 'approver']) {
      if (req.body[key] !== undefined) data[key] = req.body[key];
    }
    const result = await prisma.projectApprovalRequest.updateMany({
      where: { id: approvalId, tenantId: tenantId(req), projectId, isDeleted: false },
      data,
    });
    if (!result.count) return res.status(404).json({ error: 'Approval not found' });
    const updated = await prisma.projectApprovalRequest.findFirst({ where: { id: approvalId, tenantId: tenantId(req), projectId } });
    await writeProjectAudit(req, 'ProjectApprovalRequest', approvalId, 'update', { projectId, set: data });
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

router.delete('/projects/:projectId/approvals/:approvalId', async (req, res, next) => {
  try {
    const projectId = toProjectId(req.params.projectId);
    const approvalId = Number(req.params.approvalId);
    if (!projectId || !Number.isInteger(approvalId)) return res.status(400).json({ error: 'Invalid id' });
    if (!(await ensureProjectAccess(req, res, projectId))) return;
    const result = await prisma.projectApprovalRequest.updateMany({
      where: { id: approvalId, tenantId: tenantId(req), projectId, isDeleted: false },
      data: { isDeleted: true },
    });
    if (!result.count) return res.status(404).json({ error: 'Approval not found' });
    await writeProjectAudit(req, 'ProjectApprovalRequest', approvalId, 'delete', { projectId, softDelete: true });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

function agingBucket(daysPastDue, outstanding) {
  if (Number(outstanding || 0) <= 0 || daysPastDue <= 0) return 'CURRENT';
  if (daysPastDue <= 30) return '1-30';
  if (daysPastDue <= 60) return '31-60';
  if (daysPastDue <= 90) return '61-90';
  return 'OVER90';
}

function emptyReceivables(project) {
  return {
    projectId: String(project.id),
    projectName: project.name,
    projectRef: project.code || String(project.id),
    clientName: project.client?.name || 'Unassigned',
    totalOutstanding: 0,
    current: 0,
    days1to30: 0,
    days31to60: 0,
    days61to90: 0,
    over90: 0,
    certificates: [],
  };
}

router.get('/projects/:projectId/receivables', async (req, res, next) => {
  try {
    const projectId = toProjectId(req.params.projectId);
    if (!projectId) return res.status(400).json({ error: 'Invalid projectId' });
    if (!(await ensureProjectAccess(req, res, projectId))) return;

    const project = await prisma.project.findFirst({
      where: { id: projectId, tenantId: tenantId(req) },
      select: {
        id: true,
        name: true,
        code: true,
        client: { select: { id: true, name: true } },
      },
    });

    if (!project) return res.status(404).json({ error: 'Project not found' });

    const certificates = await prisma.paymentCertificate.findMany({
      where: {
        tenantId: tenantId(req),
        projectId,
        status: { not: 'CANCELLED' },
      },
      orderBy: { paymentDueDate: 'asc' },
      select: {
        id: true,
        certificateNumber: true,
        certificateDate: true,
        paymentDueDate: true,
        netCertified: true,
        totalPaid: true,
        totalOutstanding: true,
        lastPaymentDate: true,
      },
    });

    if (!certificates.length) return res.json(emptyReceivables(project));

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const result = emptyReceivables(project);
    result.certificates = certificates.map((cert) => {
      const dueDate = new Date(cert.paymentDueDate);
      dueDate.setHours(0, 0, 0, 0);
      const daysPastDue = Math.max(0, Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)));
      const netCertified = Number(cert.netCertified || 0);
      const totalPaid = Number(cert.totalPaid || 0);
      const outstanding = Math.max(0, Number(cert.totalOutstanding ?? (netCertified - totalPaid)));
      const bucket = agingBucket(daysPastDue, outstanding);

      if (bucket === 'CURRENT') result.current += outstanding;
      else if (bucket === '1-30') result.days1to30 += outstanding;
      else if (bucket === '31-60') result.days31to60 += outstanding;
      else if (bucket === '61-90') result.days61to90 += outstanding;
      else result.over90 += outstanding;
      result.totalOutstanding += outstanding;

      return {
        certificateId: String(cert.id),
        certificateNumber: cert.certificateNumber,
        certificateDate: cert.certificateDate,
        dueDate: cert.paymentDueDate,
        daysPastDue,
        netCertified,
        totalPaid,
        outstanding,
        agingBucket: bucket,
        projectId: String(project.id),
        projectName: project.name,
        clientName: project.client?.name || 'Unassigned',
        lastChaseDate: null,
        lastChaseNote: null,
      };
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/projects/:projectId/audit', async (req, res, next) => {
  try {
    const projectId = toProjectId(req.params.projectId);
    if (!projectId) return res.status(400).json({ error: 'Invalid projectId' });
    if (!(await ensureProjectAccess(req, res, projectId))) return;
    const { pageSize, skip } = pageOptions(req.query);
    const actions = csvList(req.query.action);
    const entities = csvList(req.query.entity_type);
    const search = String(req.query.search || '').trim();
    const where = {
      AND: [
        { changes: { path: ['tenantId'], equals: tenantId(req) } },
        { changes: { path: ['projectId'], equals: projectId } },
      ],
      ...(actions.length ? { action: { in: actions } } : {}),
      ...(entities.length ? { entity: { in: entities } } : {}),
      ...(search
        ? {
            AND: [{
              OR: [
                { entity: { contains: search, mode: 'insensitive' } },
                { action: { contains: search, mode: 'insensitive' } },
                { entityId: { contains: search, mode: 'insensitive' } },
              ],
            }],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.auditLog.findMany({ where, orderBy: { timestamp: 'desc' }, take: pageSize, skip }),
      prisma.auditLog.count({ where }),
    ]);
    const items = rows.map((row) => ({
      id: row.id,
      timestamp: row.timestamp,
      created_at: row.timestamp,
      user: row.userId ? `User ${row.userId}` : 'System',
      username: row.userId ? `User ${row.userId}` : 'System',
      action: row.action,
      entity_type: row.entity,
      entity_id: row.entityId,
      description: `${row.action} ${row.entity} ${row.entityId}`,
      ip_address: row.ipAddress,
      changes: row.changes,
    }));
    res.json({ items, logs: items, total });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
