const express = require('express');
const path = require('path');
const fs = require('fs/promises');
const crypto = require('crypto');
const { Prisma } = require('@prisma/client');
const { prisma } = require('../utils/prisma.cjs');
const { requireTenant } = require('../middleware/tenant.cjs');
const requireAuth = require('../middleware/requireAuth.cjs');
const { requirePerm } = require('../middleware/checkPermission.cjs');
const { writeAudit, auditReject } = require('../lib/audit.cjs');
const { makeStorageKey, localPath } = require('../utils/storage.cjs');

const router = express.Router();

const TEMPLATE_PATH = path.join(__dirname, '../templates/contract.html');
let cachedTemplate = null;

async function loadTemplate() {
  if (cachedTemplate) return cachedTemplate;
  cachedTemplate = await fs.readFile(TEMPLATE_PATH, 'utf8');
  return cachedTemplate;
}

const toDecimal = (value, { allowNull = false } = {}) => {
  if (value == null || value === '') {
    if (allowNull) return null;
    return new Prisma.Decimal(0);
  }
  if (value instanceof Prisma.Decimal) return value;
  try {
    return new Prisma.Decimal(value);
  } catch (err) {
    const error = new Error('Invalid decimal value');
    error.status = 400;
    throw error;
  }
};

function formatCurrency(value, currency = 'GBP') {
  try {
    const num = value instanceof Prisma.Decimal ? Number(value) : Number(value || 0);
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(num);
  } catch (_) {
    return String(value ?? '');
  }
}

function formatDate(value) {
  if (!value) return '';
  const dt = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toLocaleDateString('en-GB');
}

function mapLineItem(item) {
  if (!item) return null;
  return {
    id: item.id,
    contractId: item.contractId,
    description: item.description,
    qty: item.qty instanceof Prisma.Decimal ? Number(item.qty) : item.qty,
    rate: item.rate instanceof Prisma.Decimal ? Number(item.rate) : item.rate,
    total: item.total instanceof Prisma.Decimal ? Number(item.total) : item.total,
    costCode: item.costCode,
    budgetLineId: item.budgetLineId ?? null,
    packageLineItemId: item.packageLineItemId ?? null,
    tenantId: item.tenantId,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function mapContract(contract) {
  if (!contract) return null;

  const mapped = {
    id: contract.id,
    projectId: contract.projectId,
    packageId: contract.packageId,
    supplierId: contract.supplierId,
    internalTeam: contract.internalTeam,
    contractRef: contract.contractRef,
    title: contract.title,
    value: contract.value instanceof Prisma.Decimal ? Number(contract.value) : contract.value,
    currency: contract.currency,
    status: contract.status,
    startDate: contract.startDate,
    endDate: contract.endDate,
    retentionPct: contract.retentionPct instanceof Prisma.Decimal ? Number(contract.retentionPct) : contract.retentionPct,
    paymentTerms: contract.paymentTerms,
    notes: contract.notes,
    tenantId: contract.tenantId,
    createdAt: contract.createdAt,
    updatedAt: contract.updatedAt,
    draftCreatedAt: contract.draftCreatedAt,
    lockedAt: contract.lockedAt,
    sourceMode: contract.sourceMode,
    supplier: contract.supplier || null,
    package: contract.package || null,
    project: contract.project || null,
    lineItems: Array.isArray(contract.lineItems) ? contract.lineItems.map(mapLineItem) : undefined,
  };

  // Add related data if present
  if (Array.isArray(contract.applications)) {
    mapped.applications = contract.applications.map(app => ({
      id: app.id,
      applicationNo: app.applicationNo,
      periodEnd: app.periodEnd,
      amountDue: app.amountDue instanceof Prisma.Decimal ? Number(app.amountDue) : app.amountDue,
      status: app.status,
      createdAt: app.createdAt,
    }));
  }

  if (Array.isArray(contract.invoices)) {
    mapped.invoices = contract.invoices.map(inv => ({
      id: inv.id,
      number: inv.number,
      issueDate: inv.issueDate,
      dueDate: inv.dueDate,
      net: inv.net instanceof Prisma.Decimal ? Number(inv.net) : inv.net,
      vat: inv.vat instanceof Prisma.Decimal ? Number(inv.vat) : inv.vat,
      gross: inv.gross instanceof Prisma.Decimal ? Number(inv.gross) : inv.gross,
      status: inv.status,
      createdAt: inv.createdAt,
    }));
  }

  if (Array.isArray(contract.purchaseOrders)) {
    mapped.purchaseOrders = contract.purchaseOrders.map(po => ({
      id: po.id,
      code: po.code,
      supplier: po.supplier,
      orderDate: po.orderDate,
      total: po.total instanceof Prisma.Decimal ? Number(po.total) : po.total,
      status: po.status,
      createdAt: po.createdAt,
    }));
  }

  return mapped;
}

const contractInclude = {
  supplier: { select: { id: true, name: true } },
  package: { select: { id: true, name: true } },
  project: { select: { id: true, name: true, code: true } },
  rfx: { select: { id: true, title: true } },
};

const contractWithLinesInclude = {
  ...contractInclude,
  lineItems: { orderBy: { id: 'asc' } },
  // applications: {
  //   select: {
  //     id: true,
  //     applicationNo: true,
  //     periodEnd: true,
  //     netClaimed: true,
  //     certifiedAmount: true,
  //     status: true,
  //     createdAt: true,
  //   },
  //   orderBy: { id: 'desc' },
  // },
  invoices: {
    where: { contractId: { not: null } },
    select: {
      id: true,
      number: true,
      issueDate: true,
      dueDate: true,
      net: true,
      vat: true,
      gross: true,
      status: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  },
  purchaseOrders: {
    where: { contractId: { not: null } },
    select: {
      id: true,
      code: true,
      supplier: true,
      orderDate: true,
      total: true,
      status: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  },
};

async function fetchContract(tenantId, id, includeLines = false) {
  return prisma.contract.findFirst({
    where: { id, tenantId },
    include: includeLines ? contractWithLinesInclude : contractInclude,
  });
}

async function ensureProject(tenantId, projectId) {
  const project = await prisma.project.findFirst({ where: { id: projectId, tenantId } });
  if (!project) {
    const error = new Error('Project not found');
    error.status = 404;
    throw error;
  }
  return project;
}

async function ensurePackage(tenantId, projectId, packageId) {
  if (packageId == null) return null;
  const pkg = await prisma.package.findFirst({
    where: { id: packageId, projectId, project: { tenantId } },
    select: { id: true, name: true },
  });
  if (!pkg) {
    const error = new Error('Package not found');
    error.status = 404;
    throw error;
  }
  return pkg;
}

async function ensureSupplier(tenantId, supplierId) {
  if (supplierId == null) return null;
  const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, tenantId }, select: { id: true, name: true } });
  if (!supplier) {
    const error = new Error('Supplier not found');
    error.status = 404;
    throw error;
  }
  return supplier;
}

// GET /api/contracts - List contracts with optional filters
router.get('/contracts', async (req, res) => {
  let tenantId;
  try {
    tenantId = requireTenant(req);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message || 'Tenant context required' });
  }

  try {
    const { projectId, supplierId, status } = req.query;
    const where = { tenantId };

    // Optional filters
    if (projectId) {
      where.projectId = Number(projectId);
    }
    if (supplierId) {
      where.supplierId = Number(supplierId);
    }
    if (status) {
      // Support comma-separated status values
      const statuses = status.split(',').map(s => s.trim());
      where.status = statuses.length === 1 ? statuses[0] : { in: statuses };
    }

    const contracts = await prisma.contract.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      include: contractInclude,
    });
    res.json({ items: contracts.map(mapContract) });
  } catch (err) {
    console.error('[contracts.list] failed', err);
    res.status(500).json({ error: 'Failed to list contracts' });
  }
});

router.get('/projects/:projectId/contracts', async (req, res) => {
  let tenantId;
  try {
    tenantId = requireTenant(req);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message || 'Tenant context required' });
  }
  const projectId = Number(req.params.projectId);
  if (!Number.isFinite(projectId)) {
    return res.status(400).json({ error: 'Invalid project id' });
  }
  try {
    const contracts = await prisma.contract.findMany({
      where: { tenantId, projectId },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      include: contractInclude,
    });
    res.json({ items: contracts.map(mapContract) });
  } catch (err) {
    console.error('[contracts.list] failed', err);
    res.status(500).json({ error: 'Failed to list contracts' });
  }
});

router.get('/contracts/:id', async (req, res) => {
  let tenantId;
  try {
    tenantId = requireTenant(req);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message || 'Tenant context required' });
  }
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid contract id' });

  try {
    const contract = await fetchContract(tenantId, id, true);
    if (!contract) return res.status(404).json({ error: 'Contract not found' });
    res.json(mapContract(contract));
  } catch (err) {
    console.error('[contracts.get] failed', err);
    res.status(500).json({ error: 'Failed to load contract' });
  }
});

router.post('/contracts', async (req, res) => {
  let tenantId;
  try {
    tenantId = requireTenant(req);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message || 'Tenant context required' });
  }
  const body = req.body || {};
  const sourceMode = body.sourceMode || null;
  const packageId = body.packageId != null ? Number(body.packageId) : null;
  const supplierId = body.supplierId != null ? Number(body.supplierId) : null;

  // Validation: if sourceMode === "fromPackage" require packageId
  if (sourceMode === 'fromPackage' && !Number.isFinite(packageId)) {
    return res.status(400).json({ error: 'packageId is required when sourceMode is fromPackage' });
  }

  // Require supplierId
  if (!Number.isFinite(supplierId)) {
    return res.status(400).json({ error: 'supplierId is required' });
  }

  try {
    // Fetch project and package to auto-generate reference and title
    let project = null;
    let pkg = null;

    if (packageId) {
      pkg = await prisma.package.findFirst({
        where: { id: packageId, project: { tenantId } },
        include: { project: { select: { id: true, code: true, name: true } } },
      });
      if (!pkg) return res.status(404).json({ error: 'Package not found' });
      project = pkg.project;
    } else if (body.projectId) {
      const projectId = Number(body.projectId);
      if (!Number.isFinite(projectId)) return res.status(400).json({ error: 'Invalid projectId' });
      project = await prisma.project.findFirst({
        where: { id: projectId, tenantId },
        select: { id: true, code: true, name: true },
      });
      if (!project) return res.status(404).json({ error: 'Project not found' });
    } else {
      return res.status(400).json({ error: 'Either packageId or projectId is required' });
    }

    // Validate supplier
    const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, tenantId } });
    if (!supplier) return res.status(404).json({ error: 'Supplier not found' });

    // Auto-generate contractRef using project/package codes
    const projectCode = project.code || `P${project.id}`;
    const packageCode = pkg?.code || (pkg ? `PKG${pkg.id}` : '');
    const timestamp = Date.now().toString().slice(-6);
    const contractRef = body.contractRef || (pkg
      ? `${projectCode}-${packageCode}-C${timestamp}`
      : `${projectCode}-C${timestamp}`);

    // Auto-generate fallback title if not provided
    const title = body.title || (pkg
      ? `${project.name} - ${pkg.name} Contract`
      : `${project.name} Contract`);

    const valueDecimal = body.value != null ? toDecimal(body.value, { allowNull: true }) : null;
    const retention = body.retentionPct != null ? toDecimal(body.retentionPct, { allowNull: true }) : null;
    const now = new Date();

    const contractData = {
      tenantId,
      projectId: project.id,
      packageId,
      supplierId,
      contractRef,
      title,
      value: valueDecimal || new Prisma.Decimal(0),
      currency: body.currency || 'GBP',
      status: 'draft',
      startDate: body.startDate ? new Date(body.startDate) : null,
      endDate: body.endDate ? new Date(body.endDate) : null,
      retentionPct: retention,
      paymentTerms: body.paymentTerms || null,
      notes: body.notes || null,
      sourceMode,
      draftCreatedAt: now,
      lockedAt: now,
    };

    const created = await prisma.contract.create({
      data: contractData,
      include: contractInclude,
    });

    await writeAudit({
      prisma,
      req,
      entity: 'Contract',
      entityId: created.id,
      action: 'create',
      changes: { projectId: project.id, packageId, supplierId, sourceMode, status: 'draft' },
    });

    res.status(201).json(mapContract(created));
  } catch (err) {
    if (err && err.status) return res.status(err.status).json({ error: err.message });
    console.error('[contracts.create] failed', err);
    res.status(500).json({ error: 'Failed to create contract' });
  }
});

router.put('/contracts/:id', async (req, res) => {
  let tenantId;
  try {
    tenantId = requireTenant(req);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message || 'Tenant context required' });
  }
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid contract id' });

  const body = req.body || {};

  try {
    const existing = await fetchContract(tenantId, id, false);
    if (!existing) return res.status(404).json({ error: 'Contract not found' });

    // Lock validation: if draftCreatedAt exists, block packageId mutations
    if (existing.draftCreatedAt && body.packageId !== undefined) {
      const reason = 'Package is locked after draft creation. Raise a variation instead.';
      await auditReject(
        req.user?.id,
        tenantId,
        'Contract',
        id,
        'UPDATE',
        reason,
        { attemptedPackageId: body.packageId }
      );
      return res.status(409).json({
        code: 'CONTRACT_LOCKED_AFTER_DRAFT',
        message: reason,
      });
    }

    const patch = {};
    if (body.title !== undefined) patch.title = body.title == null ? null : String(body.title);
    if (body.contractRef !== undefined) patch.contractRef = body.contractRef == null ? null : String(body.contractRef);
    if (body.internalTeam !== undefined) patch.internalTeam = body.internalTeam == null ? null : String(body.internalTeam);
    if (body.notes !== undefined) patch.notes = body.notes == null ? null : String(body.notes);
    if (body.currency !== undefined) patch.currency = body.currency == null ? null : String(body.currency);
    if (body.paymentTerms !== undefined) patch.paymentTerms = body.paymentTerms == null ? null : String(body.paymentTerms);
    if (body.status !== undefined) patch.status = String(body.status);
    if (body.startDate !== undefined) patch.startDate = body.startDate ? new Date(body.startDate) : null;
    if (body.endDate !== undefined) patch.endDate = body.endDate ? new Date(body.endDate) : null;
    if (body.value !== undefined) patch.value = toDecimal(body.value, { allowNull: true });
    if (body.retentionPct !== undefined) patch.retentionPct = toDecimal(body.retentionPct, { allowNull: true });

    // Only allow packageId update if not locked
    if (body.packageId !== undefined && !existing.draftCreatedAt) {
      patch.packageId = body.packageId != null ? Number(body.packageId) : null;
    }

    if (body.supplierId !== undefined) {
      if (body.supplierId == null) {
        patch.supplierId = null;
      } else {
        const supplierId = Number(body.supplierId);
        if (!Number.isFinite(supplierId)) return res.status(400).json({ error: 'Invalid supplierId' });
        await ensureSupplier(tenantId, supplierId);
        patch.supplierId = supplierId;
        patch.internalTeam = null;
      }
    }

    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: 'No changes supplied' });
    }

    const updated = await prisma.contract.update({ where: { id }, data: patch, include: contractWithLinesInclude });

    await writeAudit({
      prisma,
      req,
      entity: 'Contract',
      entityId: id,
      action: 'update',
      changes: { set: patch },
    });

    res.json(mapContract(updated));
  } catch (err) {
    if (err && err.status) return res.status(err.status).json({ error: err.message });
    console.error('[contracts.update] failed', err);
    res.status(500).json({ error: 'Failed to update contract' });
  }
});

router.post('/contracts/:id/line-items', async (req, res) => {
  let tenantId;
  try {
    tenantId = requireTenant(req);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message || 'Tenant context required' });
  }
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid contract id' });
  const items = Array.isArray(req.body?.items) ? req.body.items : [];

  try {
    const contract = await fetchContract(tenantId, id, false);
    if (!contract) return res.status(404).json({ error: 'Contract not found' });

    // Lock validation: reject bulk line items writes when draftCreatedAt exists
    if (contract.draftCreatedAt) {
      const reason = 'Package and line items are locked after draft creation. Raise a variation instead.';
      await auditReject(
        req.user?.id,
        tenantId,
        'Contract',
        id,
        'LINE_ITEMS_BULK_UPDATE',
        reason,
        { itemsCount: items.length }
      );
      return res.status(409).json({
        code: 'CONTRACT_LOCKED_AFTER_DRAFT',
        message: reason,
      });
    }

    const prepared = items.map((item) => ({
      description: String(item.description || 'Line'),
      qty: toDecimal(item.qty, { allowNull: true }),
      rate: toDecimal(item.rate, { allowNull: true }),
      total: toDecimal(item.total, { allowNull: true }),
      costCode: item.costCode || null,
      budgetLineId: item.budgetLineId != null ? Number(item.budgetLineId) : null,
      packageLineItemId: item.packageLineItemId != null ? Number(item.packageLineItemId) : null,
    }));

    await prisma.$transaction(async (tx) => {
      await tx.contractLineItem.deleteMany({ where: { tenantId, contractId: id } });
      for (const line of prepared) {
        await tx.contractLineItem.create({
          data: {
            tenantId,
            contractId: id,
            description: line.description,
            qty: line.qty,
            rate: line.rate,
            total: line.total,
            costCode: line.costCode,
            budgetLineId: line.budgetLineId,
            packageLineItemId: line.packageLineItemId,
          },
        });
      }
    });

    await writeAudit({
      prisma,
      req,
      entity: 'Contract',
      entityId: id,
      action: 'line_items.replace',
      changes: { count: prepared.length },
    });

    const refreshed = await fetchContract(tenantId, id, true);
    res.json(mapContract(refreshed));
  } catch (err) {
    if (err && err.status) return res.status(err.status).json({ error: err.message });
    console.error('[contracts.lineItems] failed', err);
    res.status(500).json({ error: 'Failed to update line items' });
  }
});

router.put('/contract-line-items/:id', async (req, res) => {
  let tenantId;
  try {
    tenantId = requireTenant(req);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message || 'Tenant context required' });
  }
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid line item id' });

  try {
    const line = await prisma.contractLineItem.findFirst({
      where: { id, contract: { tenantId } },
      include: { contract: { select: { id: true } } },
    });
    if (!line) return res.status(404).json({ error: 'Line item not found' });

    const patch = {};
    if (req.body.description !== undefined) patch.description = req.body.description == null ? null : String(req.body.description);
    if (req.body.qty !== undefined) patch.qty = toDecimal(req.body.qty, { allowNull: true });
    if (req.body.rate !== undefined) patch.rate = toDecimal(req.body.rate, { allowNull: true });
    if (req.body.total !== undefined) patch.total = toDecimal(req.body.total, { allowNull: true });
    if (req.body.costCode !== undefined) patch.costCode = req.body.costCode == null ? null : String(req.body.costCode);
    if (req.body.budgetLineId !== undefined) {
      if (req.body.budgetLineId == null || req.body.budgetLineId === '') {
        patch.budgetLineId = null;
      } else {
        const val = Number(req.body.budgetLineId);
        if (!Number.isFinite(val)) return res.status(400).json({ error: 'Invalid budgetLineId' });
        patch.budgetLineId = val;
      }
    }
    if (req.body.packageLineItemId !== undefined) {
      if (req.body.packageLineItemId == null || req.body.packageLineItemId === '') {
        patch.packageLineItemId = null;
      } else {
        const val = Number(req.body.packageLineItemId);
        if (!Number.isFinite(val)) return res.status(400).json({ error: 'Invalid packageLineItemId' });
        patch.packageLineItemId = val;
      }
    }

    if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'No changes supplied' });

    const updated = await prisma.contractLineItem.update({ where: { id }, data: patch });

    await writeAudit({
      prisma,
      req,
      entity: 'Contract',
      entityId: line.contract.id,
      action: 'line_item.update',
      changes: { id, set: patch },
    });

    res.json(mapLineItem(updated));
  } catch (err) {
    if (err && err.status) return res.status(err.status).json({ error: err.message });
    console.error('[contracts.lineItem.update] failed', err);
    res.status(500).json({ error: 'Failed to update line item' });
  }
});

router.delete('/contract-line-items/:id', async (req, res) => {
  let tenantId;
  try {
    tenantId = requireTenant(req);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message || 'Tenant context required' });
  }
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid line item id' });

  try {
    const line = await prisma.contractLineItem.findFirst({
      where: { id, contract: { tenantId } },
      include: { contract: { select: { id: true } } },
    });
    if (!line) return res.status(404).json({ error: 'Line item not found' });

    await prisma.contractLineItem.delete({ where: { id } });

    await writeAudit({
      prisma,
      req,
      entity: 'Contract',
      entityId: line.contract.id,
      action: 'line_item.delete',
      changes: { id },
    });

    res.json({ ok: true });
  } catch (err) {
    if (err && err.status) return res.status(err.status).json({ error: err.message });
    console.error('[contracts.lineItem.delete] failed', err);
    res.status(500).json({ error: 'Failed to delete line item' });
  }
});

async function renderContractDocument(contract) {
  const template = await loadTemplate();
  const lineItems = Array.isArray(contract.lineItems) ? contract.lineItems : [];
  const currency = contract.currency || 'GBP';
  const counterpart = contract.supplier?.name || contract.internalTeam || '';
  const lineRows = lineItems.length
    ? lineItems
        .map((item) => {
          const qty = item.qty instanceof Prisma.Decimal ? Number(item.qty) : Number(item.qty || 0);
          const rate = item.rate instanceof Prisma.Decimal ? Number(item.rate) : Number(item.rate || 0);
          const total = item.total instanceof Prisma.Decimal ? Number(item.total) : Number(item.total || 0);
          return `<tr><td>${item.description || ''}</td><td>${qty.toFixed(2)}</td><td>${formatCurrency(rate, currency)}</td><td>${formatCurrency(total, currency)}</td></tr>`;
        })
        .join('\n')
    : '<tr><td colspan="4">No line items</td></tr>';

  const totalValue = lineItems.reduce((sum, item) => {
    const total = item.total instanceof Prisma.Decimal ? Number(item.total) : Number(item.total || 0);
    return sum + total;
  }, 0);

  const context = {
    title: contract.title || 'Contract',
    contractRef: contract.contractRef || '',
    supplierName: contract.supplier?.name || '',
    internalTeam: contract.internalTeam || '',
    counterpart,
    value: formatCurrency(contract.value, currency),
    total: formatCurrency(totalValue, currency),
    retention: contract.retentionPct != null ? `${Number(contract.retentionPct).toFixed(2)}%` : '0%',
    startDate: formatDate(contract.startDate),
    endDate: formatDate(contract.endDate),
    dateRange:
      contract.startDate && contract.endDate
        ? `${formatDate(contract.startDate)} — ${formatDate(contract.endDate)}`
        : formatDate(contract.startDate) || formatDate(contract.endDate) || '',
    lineItems: lineRows,
  };

  return template.replace(/\$\{([^}]+)\}/g, (_, key) => {
    const value = context[key.trim()];
    return value == null ? '' : String(value);
  });
}

async function storeDocument(tenantId, userId, contractId, html) {
  const storageKey = makeStorageKey(`contracts/${contractId}-${Date.now()}.html`);
  const absolutePath = localPath(storageKey);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, html, 'utf8');
  const size = Buffer.byteLength(html, 'utf8');
  const sha256 = crypto.createHash('sha256').update(html).digest('hex');

  const document = await prisma.document.create({
    data: {
      tenantId,
      filename: `contract-${contractId}.html`,
      mimeType: 'text/html',
      size,
      storageKey,
      sha256,
      uploadedById: userId != null ? String(userId) : null,
    },
  });

  try {
    await prisma.documentLink.create({
      data: {
        tenantId,
        documentId: document.id,
        entityType: 'Contract',
        entityId: contractId,
        linkType: 'contract',
      },
    });
  } catch (err) {
    console.warn('[contracts.doc.link] failed', err);
  }

  return document;
}

router.post('/contracts/:id/documents:generate', async (req, res) => {
  let tenantId;
  try {
    tenantId = requireTenant(req);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message || 'Tenant context required' });
  }
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid contract id' });
  const userId = req.user?.id != null ? Number(req.user.id) : null;

  try {
    const contract = await fetchContract(tenantId, id, true);
    if (!contract) return res.status(404).json({ error: 'Contract not found' });

    const html = await renderContractDocument(contract);
    const document = await prisma.$transaction(async (tx) => {
      const stored = await storeDocument(tenantId, userId, id, html);
      await tx.contract.update({ where: { id }, data: { status: 'generated' } });
      return stored;
    });

    await writeAudit({
      prisma,
      req,
      entity: 'Contract',
      entityId: id,
      action: 'document.generate',
      changes: { documentId: String(document.id) },
    });

    res.status(201).json({ documentId: String(document.id) });
  } catch (err) {
    if (err && err.status) return res.status(err.status).json({ error: err.message });
    console.error('[contracts.generateDoc] failed', err);
    res.status(500).json({ error: 'Failed to generate contract document' });
  }
});

async function updateContractStatus(req, res, status) {
  let tenantId;
  try {
    tenantId = requireTenant(req);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message || 'Tenant context required' });
  }
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid contract id' });

  try {
    const contract = await fetchContract(tenantId, id, false);
    if (!contract) return res.status(404).json({ error: 'Contract not found' });

    const updated = await prisma.contract.update({ where: { id }, data: { status }, include: contractWithLinesInclude });

    await writeAudit({
      prisma,
      req,
      entity: 'Contract',
      entityId: id,
      action: `status.${status}`,
      changes: { status },
    });

    res.json(mapContract(updated));
  } catch (err) {
    if (err && err.status) return res.status(err.status).json({ error: err.message });
    console.error('[contracts.status] failed', err);
    res.status(500).json({ error: 'Failed to update status' });
  }
}

router.post('/contracts/:id/issue', (req, res) => updateContractStatus(req, res, 'issued'));
router.post('/contracts/:id/send-for-signature', (req, res) => updateContractStatus(req, res, 'sent_for_signature'));
router.post('/contracts/:id/mark-signed', (req, res) => updateContractStatus(req, res, 'signed'));
router.post('/contracts/:id/revert-to-draft', (req, res) => updateContractStatus(req, res, 'draft'));
router.post('/contracts/:id/archive', (req, res) => updateContractStatus(req, res, 'archived'));

// DELETE /contracts/:id
router.delete('/contracts/:id', requireAuth, requirePerm('contracts:delete'), async (req, res) => {
  const tenantId  = req.tenant.id;
  const userId    = req.user.id;
  const contractId = Number(req.params.id);

  const ctr = await prisma.contract.findFirst({ where: { id: contractId, tenantId } });
  if (!ctr) return res.status(404).json({ code: 'NOT_FOUND', message: 'Contract not found' });

  if (ctr.status === 'Signed') {
    return res.status(409).json({ code: 'NOT_ALLOWED', message: 'Cannot delete a signed contract' });
  }

  // If you have POs/invoices linked, check here and block if references exist

  await prisma.contract.delete({ where: { id: contractId } });
  await writeAudit(tenantId, userId, 'ContractDeleted', 'Contract', contractId, {});
  res.json({ ok: true });
});

module.exports = router;
