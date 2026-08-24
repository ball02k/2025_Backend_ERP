const { prisma: defaultPrisma } = require('../utils/prisma.cjs');
const { writeAudit } = require('../lib/audit.cjs');

const INACTIVE_STATUSES = new Set([
  'cancelled',
  'canceled',
  'closed',
  'terminated',
  'withdrawn',
  'void',
  'archived',
  'superseded',
  'rejected',
]);
const INACTIVE_STATUS_VALUES = Array.from(new Set([
  ...Array.from(INACTIVE_STATUSES),
  ...Array.from(INACTIVE_STATUSES).map((status) => status.toUpperCase()),
  ...Array.from(INACTIVE_STATUSES).map((status) => status.charAt(0).toUpperCase() + status.slice(1)),
]));

const LIVE_CONTRACT_STATUSES = new Set([
  'issued',
  'sent_for_signature',
  'signed',
  'active',
  'live',
  'executed',
  'complete',
  'completed',
]);

const BUDGET_COMMERCIAL_FIELDS = new Set([
  'description',
  'code',
  'costCodeId',
  'categoryId',
  'qty',
  'quantity',
  'unit',
  'rate',
  'total',
  'amount',
  'planned',
  'estimated',
]);

const PACKAGE_COMMERCIAL_FIELDS = new Set([
  'name',
  'description',
  'scope',
  'scopeSummary',
  'trade',
  'tradeCategory',
  'route',
  'status',
  'contractForm',
  'contractTypeId',
  'retentionPct',
  'paymentTerms',
  'currency',
  'costCodeId',
  'budgetEstimate',
  'awardValue',
  'awardedValue',
]);

const CONTRACT_CRITICAL_FIELDS = new Set([
  'packageId',
  'supplierId',
  'value',
  'paymentTerms',
  'retentionPct',
  'retentionPercentage',
  'mainContractorDiscount',
  'mcdDescription',
]);

const CONTRACT_LINE_FIELDS = new Set([
  'description',
  'qty',
  'quantity',
  'rate',
  'total',
  'costCode',
  'budgetLineId',
  'packageLineItemId',
]);

const PURCHASE_ORDER_COMMERCIAL_FIELDS = new Set([
  'supplier',
  'supplierId',
  'projectId',
  'contractId',
  'packageId',
  'budgetLineId',
  'paymentApplicationId',
  'total',
  'notes',
  'internalNotes',
  'supplierNotes',
  'lines',
  'lineItems',
  'item',
  'description',
  'qty',
  'unit',
  'unitCost',
  'lineTotal',
]);

const INVOICE_COMMERCIAL_FIELDS = new Set([
  'number',
  'supplierInvoiceRef',
  'supplierId',
  'projectId',
  'contractId',
  'packageId',
  'budgetLineId',
  'matchedPoId',
  'paymentApplicationId',
  'net',
  'vat',
  'gross',
  'issueDate',
  'dueDate',
  'documentId',
  'documentUrl',
  'documentName',
  'lines',
  'lineItems',
]);

const PAYMENT_APPLICATION_COMMERCIAL_FIELDS = new Set([
  'title',
  'reference',
  'valuationDate',
  'periodStart',
  'periodEnd',
  'claimedGrossValue',
  'claimedRetention',
  'claimedNetValue',
  'claimedPreviouslyPaid',
  'claimedThisPeriod',
  'grossToDate',
  'variationsValue',
  'prelimsValue',
  'retentionValue',
  'mosValue',
  'offsiteValue',
  'deductionsValue',
  'netClaimed',
  'contractorNotes',
  'internalNotes',
  'lineItems',
  'variations',
  'materialsOnSite',
  'previouslyValued',
]);

const PAYMENT_CERTIFICATE_COMMERCIAL_FIELDS = new Set([
  'certificateRef',
  'certificateDate',
  'certifiedGross',
  'retentionPercentage',
  'retentionAmount',
  'mcdPercentage',
  'mcdAmount',
  'cisRate',
  'cisAmount',
  'otherDeductions',
  'otherDeductionsDesc',
  'varianceNotes',
  'certificateDocumentUrl',
]);

const PURCHASE_ORDER_LOCKED_STATUSES = new Set([
  'approved',
  'issued',
  'sent',
  'acknowledged',
  'goods_received',
  'invoice_received',
  'partially_paid',
  'paid',
  'closed',
  'complete',
  'completed',
]);

const INVOICE_LOCKED_STATUSES = new Set([
  'matched',
  'approved',
  'paid',
  'partially_paid',
  'certified',
]);

const APPLICATION_LOCKED_STATUSES = new Set([
  'submitted',
  'under_review',
  'certified',
  'payment_notice_sent',
  'payment_notice',
  'pay_less_issued',
  'pay_less_notice',
  'approved',
  'paid',
  'partially_paid',
  'disputed',
]);

const CERTIFICATE_LOCKED_STATUSES = new Set([
  'accepted',
  'paid',
  'partial',
  'partially_paid',
]);

const columnCache = new Map();

function normaliseStatus(status) {
  return String(status || '').trim().toLowerCase();
}

function isInactive(status) {
  return INACTIVE_STATUSES.has(normaliseStatus(status));
}

function isLiveContract(status) {
  return LIVE_CONTRACT_STATUSES.has(normaliseStatus(status));
}

function changedFields(proposedChanges = {}) {
  return Object.keys(proposedChanges || {}).filter((key) => proposedChanges[key] !== undefined);
}

function touches(fields, lockedFields) {
  if (!fields.length) return true;
  return fields.some((field) => lockedFields.has(field));
}

function modelClient(db, name) {
  return db && db[name] ? db[name] : null;
}

function isSchemaMiss(err) {
  const msg = String(err?.message || '').toLowerCase();
  return (
    msg.includes('does not exist') ||
    msg.includes('unknown field') ||
    msg.includes('unknown argument') ||
    msg.includes('table') && msg.includes('not exist') ||
    msg.includes('column') && msg.includes('does not exist')
  );
}

async function safeFindMany(db, model, args) {
  const client = modelClient(db, model);
  if (!client?.findMany) return [];
  try {
    return await client.findMany(args);
  } catch (err) {
    if (isSchemaMiss(err)) return [];
    throw err;
  }
}

async function safeFindFirst(db, model, args) {
  const client = modelClient(db, model);
  if (!client?.findFirst) return null;
  try {
    return await client.findFirst(args);
  } catch (err) {
    if (isSchemaMiss(err)) return null;
    throw err;
  }
}

async function hasColumn(db, tableName, columnName) {
  const key = `${tableName}.${columnName}`;
  if (columnCache.has(key)) return columnCache.get(key);
  if (!db?.$queryRaw) {
    columnCache.set(key, true);
    return true;
  }
  try {
    const rows = await db.$queryRaw`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = ${tableName}
          AND column_name = ${columnName}
      ) AS "exists"
    `;
    const exists = Boolean(Array.isArray(rows) && rows[0] && rows[0].exists);
    columnCache.set(key, exists);
    return exists;
  } catch (_) {
    columnCache.set(key, true);
    return true;
  }
}

function addBlocker(blockers, type, row, options = {}) {
  if (!row) return;
  const id = row.id ?? options.id;
  if (id == null) return;
  const key = `${type}:${id}`;
  if (blockers.some((item) => item.key === key)) return;
  blockers.push({
    key,
    type,
    id,
    label: options.label || row.title || row.name || row.contractRef || row.code || row.applicationNo || row.reference || `${type} ${id}`,
    status: row.status || options.status || null,
    route: options.route || null,
    stage: options.stage || null,
  });
}

function packageRoute(projectId, packageId) {
  return projectId && packageId ? `/projects/${projectId}/packages/${packageId}` : null;
}

function contractRoute(projectId, contractId) {
  return projectId && contractId ? `/projects/${projectId}/contracts/${contractId}` : null;
}

function decision({ allowed, code, message, stage, variationRequired = false, canOverride = true, blockers = [], warnings = [] }) {
  return {
    allowed,
    code,
    message,
    stage,
    variationRequired,
    canOverride,
    blockers: blockers.map(({ key, ...rest }) => rest),
    warnings,
  };
}

function allow(warnings = []) {
  return decision({
    allowed: true,
    code: 'COMMERCIAL_UNLOCKED',
    message: 'Commercial item can be edited directly.',
    stage: 'budget',
    canOverride: false,
    warnings,
  });
}

function blocked({ code, message, stage, blockers, variationRequired = true }) {
  return decision({
    allowed: false,
    code,
    message,
    stage,
    blockers,
    variationRequired,
    canOverride: true,
  });
}

function blockedNoOverride({ code, message, stage, blockers, variationRequired = true }) {
  return decision({
    allowed: false,
    code,
    message,
    stage,
    blockers,
    variationRequired,
    canOverride: false,
  });
}

async function collectBudgetLineBlockers({ db, tenantId, projectId, budgetLineIds }) {
  const ids = budgetLineIds.map(Number).filter(Number.isFinite);
  const blockers = [];
  if (!ids.length) return blockers;

  const packageItems = await safeFindMany(db, 'packageItem', {
    where: { tenantId, budgetLineId: { in: ids } },
    select: {
      id: true,
      budgetLineId: true,
      package: { select: { id: true, projectId: true, name: true, status: true } },
    },
  });
  const packageIds = new Set();
  const contractIds = new Set();
  for (const item of packageItems) {
    const pkg = item.package;
    if (!pkg || isInactive(pkg.status)) continue;
    packageIds.add(pkg.id);
    addBlocker(blockers, 'Package', pkg, {
      route: packageRoute(pkg.projectId || projectId, pkg.id),
      stage: normaliseStatus(pkg.status) === 'draft' ? 'package' : 'package_live',
    });
  }

  const packageLineItems = await safeFindMany(db, 'packageLineItem', {
    where: { tenantId, budgetLineItemId: { in: ids } },
    select: {
      id: true,
      budgetLineItemId: true,
      package: { select: { id: true, projectId: true, name: true, status: true } },
    },
  });
  const packageLineItemIds = [];
  for (const item of packageLineItems) {
    packageLineItemIds.push(item.id);
    const pkg = item.package;
    if (!pkg || isInactive(pkg.status)) continue;
    packageIds.add(pkg.id);
    addBlocker(blockers, 'PackageLineItem', item, {
      label: `Package line ${item.id}`,
      route: packageRoute(pkg.projectId || projectId, pkg.id),
      status: pkg.status,
      stage: normaliseStatus(pkg.status) === 'draft' ? 'package' : 'package_live',
    });
  }

  if (packageIds.size) {
    const packageIdList = Array.from(packageIds);
    const [requests, rfxs, tenders, awards, awardDecisions, packageContracts] = await Promise.all([
      safeFindMany(db, 'request', {
        where: { tenantId, packageId: { in: packageIdList }, status: { notIn: INACTIVE_STATUS_VALUES } },
        select: { id: true, packageId: true, title: true, status: true },
      }),
      safeFindMany(db, 'rfx', {
        where: { tenantId, packageId: { in: packageIdList }, status: { notIn: INACTIVE_STATUS_VALUES } },
        select: { id: true, packageId: true, projectId: true, title: true, status: true },
      }),
      safeFindMany(db, 'tender', {
        where: { tenantId, packageId: { in: packageIdList }, status: { notIn: INACTIVE_STATUS_VALUES } },
        select: { id: true, packageId: true, projectId: true, title: true, status: true },
      }),
      safeFindMany(db, 'award', {
        where: { tenantId, packageId: { in: packageIdList } },
        select: { id: true, packageId: true, projectId: true, awardValue: true },
      }),
      safeFindMany(db, 'awardDecision', {
        where: { tenantId, packageId: { in: packageIdList }, decision: { not: 'rejected' } },
        select: { id: true, packageId: true, projectId: true, decision: true },
      }),
      safeFindMany(db, 'contract', {
        where: { tenantId, packageId: { in: packageIdList }, status: { notIn: INACTIVE_STATUS_VALUES } },
        select: { id: true, packageId: true, projectId: true, title: true, contractRef: true, status: true, draftCreatedAt: true },
      }),
    ]);
    for (const row of requests) addBlocker(blockers, 'RFx', row, { stage: 'sourcing' });
    for (const row of rfxs) addBlocker(blockers, 'RFx', row, { route: row.projectId ? `/projects/${row.projectId}/tenders` : null, stage: 'sourcing' });
    for (const row of tenders) addBlocker(blockers, 'Tender', row, { route: row.projectId ? `/projects/${row.projectId}/tenders/${row.id}` : null, stage: 'sourcing' });
    for (const row of awards) addBlocker(blockers, 'Award', row, { route: row.projectId ? `/projects/${row.projectId}/packages/${row.packageId}` : null, stage: 'award' });
    for (const row of awardDecisions) addBlocker(blockers, 'AwardDecision', row, { status: row.decision, stage: 'award' });
    for (const row of packageContracts) {
      contractIds.add(row.id);
      addBlocker(blockers, 'Contract', row, {
        label: row.title || row.contractRef || `Contract ${row.id}`,
        route: contractRoute(row.projectId || projectId, row.id),
        stage: row.draftCreatedAt || isLiveContract(row.status) ? 'contract' : 'contract_draft',
      });
    }
  }

  const contractWhere = {
    tenantId,
    OR: [
      { budgetLineId: { in: ids } },
      ...(packageLineItemIds.length ? [{ packageLineItemId: { in: packageLineItemIds } }] : []),
    ],
  };
  const contractLines = await safeFindMany(db, 'contractLineItem', {
    where: contractWhere,
    select: {
      id: true,
      budgetLineId: true,
      packageLineItemId: true,
      contract: { select: { id: true, projectId: true, title: true, contractRef: true, status: true, draftCreatedAt: true } },
    },
  });
  for (const line of contractLines) {
    const ctr = line.contract;
    if (!ctr || isInactive(ctr.status)) continue;
    contractIds.add(ctr.id);
    addBlocker(blockers, 'Contract', ctr, {
      label: ctr.title || ctr.contractRef || `Contract ${ctr.id}`,
      route: contractRoute(ctr.projectId || projectId, ctr.id),
      stage: ctr.draftCreatedAt || isLiveContract(ctr.status) ? 'contract' : 'contract_draft',
    });
  }

  const invoiceLineBudgetLineAvailable = await hasColumn(db, 'InvoiceLine', 'budgetLineId');

  const [pos, invoices, invoiceLines, appLines, commitments, actuals, valuations, costs, variations] = await Promise.all([
    safeFindMany(db, 'purchaseOrder', {
      where: {
        tenantId,
        OR: [
          { budgetLineId: { in: ids } },
          ...(contractIds.size ? [{ contractId: { in: Array.from(contractIds) } }] : []),
          ...(packageIds.size ? [{ packageId: { in: Array.from(packageIds) } }] : []),
        ],
        status: { notIn: INACTIVE_STATUS_VALUES },
      },
      select: { id: true, projectId: true, code: true, status: true },
    }),
    safeFindMany(db, 'invoice', {
      where: {
        tenantId,
        OR: [
          { budgetLineId: { in: ids } },
          ...(contractIds.size ? [{ contractId: { in: Array.from(contractIds) } }] : []),
          ...(packageIds.size ? [{ packageId: { in: Array.from(packageIds) } }] : []),
        ],
        status: { notIn: INACTIVE_STATUS_VALUES },
      },
      select: { id: true, projectId: true, number: true, status: true },
    }),
    invoiceLineBudgetLineAvailable ? safeFindMany(db, 'invoiceLine', {
      where: { tenantId, budgetLineId: { in: ids } },
      select: { id: true, invoiceId: true, description: true },
    }) : Promise.resolve([]),
    safeFindMany(db, 'paymentApplicationLineItem', {
      where: { tenantId, budgetLineId: { in: ids } },
      select: { id: true, applicationId: true, description: true, application: { select: { id: true, projectId: true, applicationNo: true, status: true } } },
    }),
    safeFindMany(db, 'cVRCommitment', {
      where: { tenantId, budgetLineId: { in: ids }, status: { notIn: ['CANCELLED', 'SUPERSEDED', 'REVERSED'] } },
      select: { id: true, projectId: true, sourceType: true, status: true, reference: true },
    }),
    safeFindMany(db, 'cVRActual', {
      where: { tenantId, budgetLineId: { in: ids }, status: { notIn: ['REVERSED', 'CANCELLED'] } },
      select: { id: true, projectId: true, sourceType: true, status: true, reference: true },
    }),
    safeFindMany(db, 'contractValuation', {
      where: { tenantId, budgetLineId: { in: ids }, status: { notIn: ['CANCELLED', 'VOID'] } },
      select: { id: true, contractId: true, status: true, valuationNumber: true },
    }),
    safeFindMany(db, 'projectCost', {
      where: { tenantId, budgetLineId: { in: ids }, costStatus: { notIn: ['CANCELLED', 'REVERSED'] } },
      select: { id: true, projectId: true, costStatus: true, reference: true, description: true },
    }),
    safeFindMany(db, 'variation', {
      where: { tenantId, budgetLineId: { in: ids }, status: { notIn: INACTIVE_STATUS_VALUES } },
      select: { id: true, projectId: true, title: true, status: true, reference: true },
    }),
  ]);

  for (const row of pos) addBlocker(blockers, 'PurchaseOrder', row, { label: row.code, route: row.projectId ? `/projects/${row.projectId}/finance/pos` : null, stage: 'finance' });
  for (const row of invoices) addBlocker(blockers, 'Invoice', row, { label: row.number, route: row.projectId ? `/projects/${row.projectId}/finance/invoices` : null, stage: 'finance' });
  for (const row of invoiceLines) addBlocker(blockers, 'InvoiceLine', row, { label: row.description || `Invoice line ${row.id}`, stage: 'finance' });
  for (const row of appLines) addBlocker(blockers, 'ApplicationForPayment', row.application || row, {
    label: row.application?.applicationNo || row.description || `Application line ${row.id}`,
    route: row.application?.projectId ? `/projects/${row.application.projectId}/finance/applications` : null,
    stage: 'payment_application',
  });
  for (const row of commitments) addBlocker(blockers, 'CVRCommitment', row, { label: row.reference || row.sourceType, stage: 'cvr' });
  for (const row of actuals) addBlocker(blockers, 'CVRActual', row, { label: row.reference || row.sourceType, stage: 'cvr' });
  for (const row of valuations) addBlocker(blockers, 'ContractValuation', row, { label: `Valuation ${row.valuationNumber}`, stage: 'valuation' });
  for (const row of costs) addBlocker(blockers, 'ProjectCost', row, { label: row.reference || row.description, stage: 'cost' });
  for (const row of variations) addBlocker(blockers, 'Variation', row, { label: row.reference || row.title, route: row.projectId ? `/projects/${row.projectId}/variations` : null, stage: 'variation' });

  return blockers;
}

async function evaluateBudgetLineLock(params) {
  const db = params.prisma || defaultPrisma;
  const tenantId = params.tenantId;
  const projectId = Number(params.projectId);
  const budgetLineId = Number(params.budgetLineId);
  const action = String(params.action || 'update').toLowerCase();
  const fields = changedFields(params.proposedChanges);

  if (!tenantId || !Number.isFinite(projectId) || !Number.isFinite(budgetLineId)) {
    return blocked({
      code: 'COMMERCIAL_LOCK_BAD_CONTEXT',
      message: 'Cannot evaluate commercial lock without tenant, project and budget line.',
      stage: 'unknown',
      blockers: [],
      variationRequired: false,
    });
  }

  const existing = await safeFindFirst(db, 'budgetLine', {
    where: { id: budgetLineId, tenantId, projectId },
    select: { id: true },
  });
  if (!existing) {
    return blocked({
      code: 'BUDGET_LINE_NOT_FOUND',
      message: 'Budget line was not found for this project.',
      stage: 'unknown',
      blockers: [],
      variationRequired: false,
    });
  }

  if (action === 'reorder' || !touches(fields, BUDGET_COMMERCIAL_FIELDS)) {
    return allow();
  }

  const blockers = await collectBudgetLineBlockers({ db, tenantId, projectId, budgetLineIds: [budgetLineId] });
  if (!blockers.length) return allow();

  const hard = blockers.filter((b) => ['contract', 'finance', 'payment_application', 'cvr', 'valuation', 'cost', 'variation'].includes(b.stage));
  const onlyDraftPackageUse = blockers.every((b) => b.stage === 'package');
  if (action === 'update' && !hard.length && onlyDraftPackageUse) {
    return allow([{
      code: 'BUDGET_LINE_USED_BY_DRAFT_PACKAGE',
      message: 'This line is already in a draft package. Commercial edits are allowed, but package snapshots should be refreshed.',
      blockers,
    }]);
  }

  const source = hard[0] || blockers[0];
  return blocked({
    code: source.stage === 'package' ? 'BUDGET_LINE_USED_BY_PACKAGE' : 'BUDGET_LINE_LOCKED_DOWNSTREAM',
    message: source.stage === 'package'
      ? 'This budget line is already in a package. Remove or cancel the package link before changing commercial values.'
      : 'This budget line is already live downstream. Use a variation or cancel the later stage before changing the original budget.',
    stage: source.stage || 'downstream',
    blockers,
    variationRequired: source.stage !== 'package',
  });
}

async function evaluateBudgetLinesLock(params) {
  const ids = Array.isArray(params.budgetLineIds) ? params.budgetLineIds.map(Number).filter(Number.isFinite) : [];
  const blockers = [];
  for (const id of ids) {
    const result = await evaluateBudgetLineLock({ ...params, budgetLineId: id });
    if (!result.allowed) blockers.push(...result.blockers.map((b) => ({ ...b, budgetLineId: id })));
  }
  if (!blockers.length) return allow();
  return decision({
    allowed: false,
    code: 'BUDGET_LINES_LOCKED_DOWNSTREAM',
    message: 'One or more selected budget lines are already live downstream.',
    stage: 'downstream',
    variationRequired: true,
    canOverride: true,
    blockers,
  });
}

async function evaluatePackageLock(params) {
  const db = params.prisma || defaultPrisma;
  const tenantId = params.tenantId;
  const projectId = Number(params.projectId);
  const packageId = Number(params.packageId);
  const action = String(params.action || 'update').toLowerCase();
  const fields = changedFields(params.proposedChanges);

  const pkg = await safeFindFirst(db, 'package', {
    where: { id: packageId, projectId, project: { tenantId } },
    select: { id: true, projectId: true, name: true, status: true, awardedToSupplierId: true, awardSupplierId: true },
  });
  if (!pkg) {
    return blocked({
      code: 'PACKAGE_NOT_FOUND',
      message: 'Package was not found for this project.',
      stage: 'unknown',
      blockers: [],
      variationRequired: false,
    });
  }

  if (action === 'metadata' || !touches(fields, PACKAGE_COMMERCIAL_FIELDS)) return allow();

  const [requests, rfxs, tenders, awards, contracts, pos, invoices] = await Promise.all([
    safeFindMany(db, 'request', {
      where: { tenantId, packageId, status: { notIn: INACTIVE_STATUS_VALUES } },
      select: { id: true, title: true, status: true },
    }),
    safeFindMany(db, 'rfx', {
      where: { tenantId, packageId, status: { notIn: INACTIVE_STATUS_VALUES } },
      select: { id: true, title: true, status: true, projectId: true },
    }),
    safeFindMany(db, 'tender', {
      where: { tenantId, packageId, status: { notIn: INACTIVE_STATUS_VALUES } },
      select: { id: true, title: true, status: true, projectId: true },
    }),
    safeFindMany(db, 'award', {
      where: { tenantId, packageId },
      select: { id: true, projectId: true, awardValue: true },
    }),
    safeFindMany(db, 'contract', {
      where: { tenantId, packageId, status: { notIn: INACTIVE_STATUS_VALUES } },
      select: { id: true, projectId: true, title: true, contractRef: true, status: true, draftCreatedAt: true },
    }),
    safeFindMany(db, 'purchaseOrder', {
      where: { tenantId, packageId, status: { notIn: INACTIVE_STATUS_VALUES } },
      select: { id: true, projectId: true, code: true, status: true },
    }),
    safeFindMany(db, 'invoice', {
      where: { tenantId, packageId, status: { notIn: INACTIVE_STATUS_VALUES } },
      select: { id: true, projectId: true, number: true, status: true },
    }),
  ]);

  const blockers = [];
  for (const row of requests) addBlocker(blockers, 'RFx', row, { stage: 'sourcing' });
  for (const row of rfxs) addBlocker(blockers, 'RFx', row, { route: `/projects/${row.projectId}/tenders`, stage: 'sourcing' });
  for (const row of tenders) addBlocker(blockers, 'Tender', row, { route: `/projects/${row.projectId}/tenders/${row.id}`, stage: 'sourcing' });
  for (const row of awards) addBlocker(blockers, 'Award', row, { route: `/projects/${row.projectId}/packages/${packageId}`, stage: 'award' });
  for (const row of contracts) addBlocker(blockers, 'Contract', row, { label: row.title || row.contractRef, route: contractRoute(row.projectId || projectId, row.id), stage: row.draftCreatedAt || isLiveContract(row.status) ? 'contract' : 'contract_draft' });
  for (const row of pos) addBlocker(blockers, 'PurchaseOrder', row, { label: row.code, route: `/projects/${row.projectId}/finance/pos`, stage: 'finance' });
  for (const row of invoices) addBlocker(blockers, 'Invoice', row, { label: row.number, route: `/projects/${row.projectId}/finance/invoices`, stage: 'finance' });
  if (pkg.awardedToSupplierId || pkg.awardSupplierId || ['awarded', 'contracted'].includes(normaliseStatus(pkg.status))) {
    addBlocker(blockers, 'Package', pkg, { route: packageRoute(projectId, packageId), stage: 'award' });
  }

  if (!blockers.length) return allow();
  return blocked({
    code: 'PACKAGE_LOCKED_DOWNSTREAM',
    message: 'This package has sourcing, award, contract or finance activity. Cancel/reverse that stage or use a variation before editing commercial details.',
    stage: blockers[0].stage || 'downstream',
    blockers,
  });
}

async function evaluateContractLock(params) {
  const db = params.prisma || defaultPrisma;
  const tenantId = params.tenantId;
  const contractId = Number(params.contractId);
  const action = String(params.action || 'update').toLowerCase();
  const fields = changedFields(params.proposedChanges);

  const contract = await safeFindFirst(db, 'contract', {
    where: { id: contractId, tenantId },
    select: { id: true, projectId: true, title: true, contractRef: true, status: true, draftCreatedAt: true, signedAt: true },
  });
  if (!contract) {
    return blocked({ code: 'CONTRACT_NOT_FOUND', message: 'Contract was not found.', stage: 'unknown', blockers: [], variationRequired: false });
  }

  const blockers = [];
  const live = isLiveContract(contract.status) || Boolean(contract.signedAt);
  if (action === 'delete') {
    if (live) {
      addBlocker(blockers, 'Contract', contract, { label: contract.title || contract.contractRef, route: contractRoute(contract.projectId, contract.id), stage: 'contract' });
    }
    const [pos, invoices, apps, certificates] = await Promise.all([
      safeFindMany(db, 'purchaseOrder', { where: { tenantId, contractId, status: { notIn: INACTIVE_STATUS_VALUES } }, select: { id: true, projectId: true, code: true, status: true } }),
      safeFindMany(db, 'invoice', { where: { tenantId, contractId, status: { notIn: INACTIVE_STATUS_VALUES } }, select: { id: true, projectId: true, number: true, status: true } }),
      safeFindMany(db, 'applicationForPayment', { where: { tenantId, contractId, status: { notIn: INACTIVE_STATUS_VALUES } }, select: { id: true, projectId: true, applicationNo: true, status: true } }),
      safeFindMany(db, 'paymentCertificate', { where: { tenantId, paymentApplication: { is: { contractId } } }, select: { id: true, projectId: true, certificateRef: true } }),
    ]);
    for (const row of pos) addBlocker(blockers, 'PurchaseOrder', row, { label: row.code, route: `/projects/${row.projectId}/finance/pos`, stage: 'finance' });
    for (const row of invoices) addBlocker(blockers, 'Invoice', row, { label: row.number, route: `/projects/${row.projectId}/finance/invoices`, stage: 'finance' });
    for (const row of apps) addBlocker(blockers, 'ApplicationForPayment', row, { label: row.applicationNo, route: `/projects/${row.projectId}/finance/applications`, stage: 'payment_application' });
    for (const row of certificates) addBlocker(blockers, 'PaymentCertificate', row, { label: row.certificateRef || `Certificate ${row.id}`, route: `/projects/${row.projectId}/finance/certificates`, stage: 'certificate' });
    if (blockers.length) {
      return blocked({
        code: 'CONTRACT_DELETE_BLOCKED',
        message: 'This contract is signed/live or has linked finance records. Archive, reverse or use admin override with a reason.',
        stage: blockers[0].stage || 'contract',
        blockers,
      });
    }
    return allow();
  }

  if (!touches(fields, CONTRACT_CRITICAL_FIELDS)) return allow();
  if (contract.draftCreatedAt && fields.includes('packageId')) {
    addBlocker(blockers, 'Contract', contract, { label: contract.title || contract.contractRef, route: contractRoute(contract.projectId, contract.id), stage: 'contract_draft' });
  }
  if (live && fields.some((field) => CONTRACT_CRITICAL_FIELDS.has(field))) {
    addBlocker(blockers, 'Contract', contract, { label: contract.title || contract.contractRef, route: contractRoute(contract.projectId, contract.id), stage: 'contract' });
  }
  if (!blockers.length) return allow();
  return blocked({
    code: live ? 'CONTRACT_LOCKED_AFTER_SIGNING' : 'CONTRACT_LOCKED_AFTER_DRAFT',
    message: live
      ? 'This contract is signed/live. Commercial changes must be handled by variation.'
      : 'This contract draft has been created. Package linkage is locked.',
    stage: blockers[0].stage,
    blockers,
  });
}

async function evaluateContractLineLock(params) {
  const db = params.prisma || defaultPrisma;
  const tenantId = params.tenantId;
  const id = Number(params.contractLineItemId);
  const action = String(params.action || 'update').toLowerCase();
  const fields = changedFields(params.proposedChanges);

  const line = await safeFindFirst(db, 'contractLineItem', {
    where: { id, contract: { tenantId } },
    select: {
      id: true,
      contract: { select: { id: true, projectId: true, title: true, contractRef: true, status: true, draftCreatedAt: true, signedAt: true } },
    },
  });
  if (!line?.contract) {
    return blocked({ code: 'CONTRACT_LINE_NOT_FOUND', message: 'Contract line was not found.', stage: 'unknown', blockers: [], variationRequired: false });
  }
  if (action !== 'delete' && !touches(fields, CONTRACT_LINE_FIELDS)) return allow();

  const ctr = line.contract;
  if (!ctr.draftCreatedAt && !isLiveContract(ctr.status) && !ctr.signedAt) return allow();

  const blockers = [];
  addBlocker(blockers, 'Contract', ctr, {
    label: ctr.title || ctr.contractRef,
    route: contractRoute(ctr.projectId, ctr.id),
    stage: isLiveContract(ctr.status) || ctr.signedAt ? 'contract' : 'contract_draft',
  });
  return blocked({
    code: isLiveContract(ctr.status) || ctr.signedAt ? 'CONTRACT_LINE_LOCKED_AFTER_SIGNING' : 'CONTRACT_LINE_LOCKED_AFTER_DRAFT',
    message: isLiveContract(ctr.status) || ctr.signedAt
      ? 'This contract is signed/live. Line changes must be handled by variation.'
      : 'Contract line items are locked after draft creation. Raise a variation instead.',
    stage: blockers[0].stage,
    blockers,
  });
}

async function evaluatePurchaseOrderLock(params) {
  const db = params.prisma || defaultPrisma;
  const tenantId = params.tenantId;
  const id = Number(params.purchaseOrderId);
  const action = String(params.action || 'update').toLowerCase();
  const fields = changedFields(params.proposedChanges);

  const po = await safeFindFirst(db, 'purchaseOrder', {
    where: { id, tenantId },
    select: {
      id: true,
      projectId: true,
      code: true,
      status: true,
      contractId: true,
      packageId: true,
      paymentApplicationId: true,
    },
  });
  if (!po) {
    return blocked({ code: 'PURCHASE_ORDER_NOT_FOUND', message: 'Purchase order was not found.', stage: 'unknown', blockers: [], variationRequired: false });
  }

  if (['issue', 'receipt', 'close', 'generate_pdf', 'workflow'].includes(action)) return allow();
  if (action !== 'delete' && !touches(fields, PURCHASE_ORDER_COMMERCIAL_FIELDS)) return allow();

  const blockers = [];
  const status = normaliseStatus(po.status);
  if (PURCHASE_ORDER_LOCKED_STATUSES.has(status)) {
    addBlocker(blockers, 'PurchaseOrder', po, {
      label: po.code || `PO ${po.id}`,
      route: po.projectId ? `/projects/${po.projectId}/finance/pos` : null,
      stage: 'finance',
    });
  }

  if (action === 'delete') {
    const [invoices, deliveries, applications] = await Promise.all([
      safeFindMany(db, 'invoice', {
        where: { tenantId, matchedPoId: id, status: { notIn: INACTIVE_STATUS_VALUES } },
        select: { id: true, projectId: true, number: true, status: true },
      }),
      safeFindMany(db, 'delivery', {
        where: { tenantId, poId: id },
        select: { id: true, receivedAt: true, note: true },
      }),
      po.paymentApplicationId ? safeFindMany(db, 'applicationForPayment', {
        where: { tenantId, id: po.paymentApplicationId, status: { notIn: INACTIVE_STATUS_VALUES } },
        select: { id: true, projectId: true, applicationNo: true, status: true },
      }) : Promise.resolve([]),
    ]);

    for (const row of invoices) addBlocker(blockers, 'Invoice', row, { label: row.number, route: row.projectId ? `/projects/${row.projectId}/finance/invoices` : null, stage: 'finance' });
    for (const row of deliveries) addBlocker(blockers, 'Delivery', row, { label: row.note || `Delivery ${row.id}`, stage: 'delivery' });
    for (const row of applications) addBlocker(blockers, 'ApplicationForPayment', row, { label: row.applicationNo, route: row.projectId ? `/projects/${row.projectId}/finance/applications` : null, stage: 'payment_application' });
  }

  if (!blockers.length) return allow();
  return blocked({
    code: action === 'delete' ? 'PURCHASE_ORDER_DELETE_BLOCKED' : 'PURCHASE_ORDER_LOCKED_AFTER_ISSUE',
    message: action === 'delete'
      ? 'This purchase order has been issued or has linked finance activity. Cancel/reverse that stage before deleting it.'
      : 'This purchase order has been issued or progressed. Raise a variation or reversal instead of editing the original order.',
    stage: blockers[0].stage || 'finance',
    blockers,
  });
}

async function evaluateInvoiceLock(params) {
  const db = params.prisma || defaultPrisma;
  const tenantId = params.tenantId;
  const id = Number(params.invoiceId);
  const action = String(params.action || 'update').toLowerCase();
  const fields = changedFields(params.proposedChanges);

  const invoice = await safeFindFirst(db, 'invoice', {
    where: { id, tenantId },
    select: {
      id: true,
      projectId: true,
      number: true,
      status: true,
      matchedPoId: true,
      paymentApplicationId: true,
      paidDate: true,
    },
  });
  if (!invoice) {
    return blocked({ code: 'INVOICE_NOT_FOUND', message: 'Invoice was not found.', stage: 'unknown', blockers: [], variationRequired: false });
  }

  if (['approve', 'reject', 'workflow'].includes(action) && !['paid', 'partially_paid'].includes(normaliseStatus(invoice.status))) {
    return allow();
  }
  if (action !== 'delete' && !touches(fields, INVOICE_COMMERCIAL_FIELDS)) return allow();

  const blockers = [];
  const status = normaliseStatus(invoice.status);
  if (INVOICE_LOCKED_STATUSES.has(status) || Boolean(invoice.paidDate)) {
    addBlocker(blockers, 'Invoice', invoice, {
      label: invoice.number || `Invoice ${invoice.id}`,
      route: invoice.projectId ? `/projects/${invoice.projectId}/finance/invoices` : null,
      stage: 'finance',
    });
  }

  if (invoice.matchedPoId) {
    const po = await safeFindFirst(db, 'purchaseOrder', {
      where: { tenantId, id: invoice.matchedPoId },
      select: { id: true, projectId: true, code: true, status: true },
    });
    if (po && PURCHASE_ORDER_LOCKED_STATUSES.has(normaliseStatus(po.status))) {
      addBlocker(blockers, 'PurchaseOrder', po, { label: po.code, route: po.projectId ? `/projects/${po.projectId}/finance/pos` : null, stage: 'finance' });
    }
  }

  if (invoice.paymentApplicationId) {
    const app = await safeFindFirst(db, 'applicationForPayment', {
      where: { tenantId, id: invoice.paymentApplicationId, status: { notIn: INACTIVE_STATUS_VALUES } },
      select: { id: true, projectId: true, applicationNo: true, status: true },
    });
    addBlocker(blockers, 'ApplicationForPayment', app, { label: app?.applicationNo, route: app?.projectId ? `/projects/${app.projectId}/finance/applications` : null, stage: 'payment_application' });
  }

  if (!blockers.length) return allow();
  return blocked({
    code: action === 'delete' ? 'INVOICE_DELETE_BLOCKED' : 'INVOICE_LOCKED_AFTER_APPROVAL',
    message: action === 'delete'
      ? 'This invoice is approved, paid, matched, or linked to a payment application. Reverse that stage before deleting it.'
      : 'This invoice is approved, paid, matched, or linked downstream. Use a reversal or controlled workflow action instead of editing the original invoice.',
    stage: blockers[0].stage || 'finance',
    blockers,
  });
}

async function evaluatePaymentApplicationLock(params) {
  const db = params.prisma || defaultPrisma;
  const tenantId = params.tenantId;
  const id = Number(params.applicationId);
  const action = String(params.action || 'update').toLowerCase();
  const fields = changedFields(params.proposedChanges);

  const application = await safeFindFirst(db, 'applicationForPayment', {
    where: { id, tenantId },
    select: {
      id: true,
      projectId: true,
      applicationNo: true,
      status: true,
      certifiedDate: true,
      amountPaid: true,
      paidDate: true,
      paymentNoticeSentAt: true,
      payLessNoticeSentAt: true,
    },
  });
  if (!application) {
    return blocked({ code: 'PAYMENT_APPLICATION_NOT_FOUND', message: 'Payment application was not found.', stage: 'unknown', blockers: [], variationRequired: false });
  }

  if (['submit', 'review', 'certify', 'notice', 'approve', 'record_payment', 'reject', 'withdraw', 'cancel', 'dispute', 'workflow'].includes(action)) {
    return allow();
  }
  if (action !== 'delete' && action !== 'recalculate' && !touches(fields, PAYMENT_APPLICATION_COMMERCIAL_FIELDS)) return allow();

  const blockers = [];
  const status = normaliseStatus(application.status);
  if (APPLICATION_LOCKED_STATUSES.has(status) || application.certifiedDate || application.paidDate || Number(application.amountPaid || 0) > 0 || application.paymentNoticeSentAt || application.payLessNoticeSentAt) {
    addBlocker(blockers, 'ApplicationForPayment', application, {
      label: application.applicationNo || `Application ${application.id}`,
      route: application.projectId ? `/projects/${application.projectId}/finance/applications` : null,
      stage: 'payment_application',
    });
  }

  const [certificates, invoices, payments] = await Promise.all([
    safeFindMany(db, 'paymentCertificate', {
      where: { tenantId, paymentApplicationId: id },
      select: { id: true, projectId: true, certificateRef: true, certificateNumber: true, status: true, paymentStatus: true },
    }),
    safeFindMany(db, 'invoice', {
      where: { tenantId, paymentApplicationId: id, status: { notIn: INACTIVE_STATUS_VALUES } },
      select: { id: true, projectId: true, number: true, status: true },
    }),
    safeFindMany(db, 'paymentRecord', {
      where: { tenantId, paymentApplicationId: id, status: { notIn: ['REVERSED', 'CANCELLED'] } },
      select: { id: true, status: true, paymentReference: true },
    }),
  ]);

  for (const row of certificates) addBlocker(blockers, 'PaymentCertificate', row, { label: row.certificateRef || `Certificate ${row.certificateNumber || row.id}`, route: row.projectId ? `/projects/${row.projectId}/finance/certificates` : null, stage: 'certificate' });
  for (const row of invoices) addBlocker(blockers, 'Invoice', row, { label: row.number, route: row.projectId ? `/projects/${row.projectId}/finance/invoices` : null, stage: 'finance' });
  for (const row of payments) addBlocker(blockers, 'PaymentRecord', row, { label: row.paymentReference || `Payment ${row.id}`, stage: 'payment' });

  if (!blockers.length) return allow();
  return blockedNoOverride({
    code: action === 'delete' ? 'PAYMENT_APPLICATION_DELETE_BLOCKED' : 'PAYMENT_APPLICATION_LOCKED_AFTER_SUBMISSION',
    message: action === 'delete'
      ? 'This payment application has been submitted, certified, paid, or linked downstream. Withdraw/reverse the later stage before deleting it.'
      : 'This payment application has been submitted, certified, paid, or linked downstream. Create a correction/reversal rather than editing the original values.',
    stage: blockers[0].stage || 'payment_application',
    blockers,
  });
}

async function evaluatePaymentCertificateLock(params) {
  const db = params.prisma || defaultPrisma;
  const tenantId = params.tenantId;
  const id = String(params.certificateId || '');
  const action = String(params.action || 'update').toLowerCase();
  const fields = changedFields(params.proposedChanges);

  const certificate = await safeFindFirst(db, 'paymentCertificate', {
    where: { id, tenantId },
    select: {
      id: true,
      projectId: true,
      certificateRef: true,
      certificateNumber: true,
      status: true,
      paymentStatus: true,
      totalPaid: true,
    },
  });
  if (!certificate) {
    return blocked({ code: 'PAYMENT_CERTIFICATE_NOT_FOUND', message: 'Payment certificate was not found.', stage: 'unknown', blockers: [], variationRequired: false });
  }

  if (['accept', 'dispute', 'workflow', 'record_payment'].includes(action)) return allow();
  if (action !== 'delete' && !touches(fields, PAYMENT_CERTIFICATE_COMMERCIAL_FIELDS)) return allow();

  const blockers = [];
  const status = normaliseStatus(certificate.status);
  const paymentStatus = normaliseStatus(certificate.paymentStatus);
  if (CERTIFICATE_LOCKED_STATUSES.has(status) || CERTIFICATE_LOCKED_STATUSES.has(paymentStatus) || Number(certificate.totalPaid || 0) > 0) {
    addBlocker(blockers, 'PaymentCertificate', certificate, {
      label: certificate.certificateRef || `Certificate ${certificate.certificateNumber || certificate.id}`,
      route: certificate.projectId ? `/projects/${certificate.projectId}/finance/certificates` : null,
      stage: 'certificate',
    });
  }

  const payments = await safeFindMany(db, 'certificatePayment', {
    where: { tenantId, paymentCertificateId: id },
    select: { id: true, paymentReference: true },
  });
  for (const row of payments) addBlocker(blockers, 'CertificatePayment', row, { label: row.paymentReference || `Payment ${row.id}`, stage: 'payment' });

  if (!blockers.length) return allow();
  return blockedNoOverride({
    code: action === 'delete' ? 'PAYMENT_CERTIFICATE_DELETE_BLOCKED' : 'PAYMENT_CERTIFICATE_LOCKED_AFTER_ACCEPTANCE',
    message: action === 'delete'
      ? 'This payment certificate has been accepted or has payments recorded. Reverse those records before deleting it.'
      : 'This payment certificate has been accepted or paid. Use a dispute/payment workflow action rather than editing the original certificate.',
    stage: blockers[0].stage || 'certificate',
    blockers,
  });
}

function lockError(decisionResult) {
  const err = new Error(decisionResult.message || 'Commercial item is locked');
  err.status = 409;
  err.code = decisionResult.code || 'COMMERCIAL_LOCKED';
  err.commercialLock = decisionResult;
  return err;
}

function assertCommercialUnlocked(decisionResult) {
  if (decisionResult?.allowed) return decisionResult;
  throw lockError(decisionResult);
}

function isAdminLike(user) {
  const roles = Array.isArray(user?.roles) ? user.roles : user?.role ? [user.role] : [];
  const normalised = roles.map((role) => String(role || '').toLowerCase());
  return Boolean(user?.isDevBypass) || normalised.includes('admin') || normalised.includes('dev') || normalised.includes('owner');
}

function getOverrideReason(req) {
  return String(req?.body?.commercialOverrideReason || req?.body?.overrideReason || req?.query?.commercialOverrideReason || req?.query?.overrideReason || '').trim();
}

function canOverrideCommercialLock(req, decisionResult) {
  return Boolean(decisionResult && !decisionResult.allowed && decisionResult.canOverride && isAdminLike(req.user) && getOverrideReason(req));
}

async function auditCommercialLockReject(req, entity, entityId, action, decisionResult) {
  await writeAudit(req.user?.tenantId || req.tenant?.id || '', req.user?.id || null, `${action}_REJECTED`, entity, entityId, {
    reason: decisionResult?.message,
    code: decisionResult?.code,
    blockers: decisionResult?.blockers || [],
  });
}

async function auditCommercialLockOverride(req, entity, entityId, action, decisionResult) {
  await writeAudit(req.user?.tenantId || req.tenant?.id || '', req.user?.id || null, `${action}_OVERRIDE`, entity, entityId, {
    reason: getOverrideReason(req),
    code: decisionResult?.code,
    blockers: decisionResult?.blockers || [],
  });
}

async function enforceDecision(req, entity, entityId, action, decisionResult) {
  if (decisionResult?.allowed) return decisionResult;
  if (canOverrideCommercialLock(req, decisionResult)) {
    await auditCommercialLockOverride(req, entity, entityId, action, decisionResult);
    return { ...decisionResult, allowed: true, overridden: true, overrideReason: getOverrideReason(req) };
  }
  await auditCommercialLockReject(req, entity, entityId, action, decisionResult);
  throw lockError(decisionResult);
}

function sendCommercialLock(res, err) {
  if (!err?.commercialLock) return false;
  res.status(err.status || 409).json({
    code: err.code || 'COMMERCIAL_LOCKED',
    message: err.message,
    control: err.commercialLock,
  });
  return true;
}

module.exports = {
  evaluateBudgetLineLock,
  evaluateBudgetLinesLock,
  evaluatePackageLock,
  evaluateContractLock,
  evaluateContractLineLock,
  evaluatePurchaseOrderLock,
  evaluateInvoiceLock,
  evaluatePaymentApplicationLock,
  evaluatePaymentCertificateLock,
  assertCommercialUnlocked,
  enforceDecision,
  sendCommercialLock,
  canOverrideCommercialLock,
  isAdminLike,
};
