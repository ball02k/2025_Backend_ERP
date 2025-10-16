const { prisma, toDecimal } = require('../lib/prisma.js');
const { writeAudit } = require('../lib/audit.cjs');

function getTenantId(req) {
  return req.user?.tenantId || req.tenantId || 'demo';
}

function serializePackage(pkg) {
  if (!pkg) return pkg;
  return { ...pkg, scope: pkg.scopeSummary ?? null };
}

// List packages for a project (with basic info and submission count)
exports.listPackages = async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const projectId = Number(req.params.projectId);
    const packages = await prisma.package.findMany({
      where: { projectId, project: { tenantId } },
      include: {
        awardSupplier: { select: { name: true, id: true } },
        contracts: {
          where: { tenantId },
          orderBy: { createdAt: 'desc' },
          include: { supplier: { select: { id: true, name: true } } },
        },
        tenders: { select: { id: true } },
        _count: { select: { submissions: true, tenders: true } },
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
    res.json(packages.map(serializePackage));
  } catch (err) {
    console.error('Error listing packages:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Create a new package under a project
exports.createPackage = async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const projectId = Number(req.params.projectId);
    const { name, scopeSummary, scope, trade, budgetEstimate, deadline } = req.body || {};
    const project = await prisma.project.findFirst({ where: { id: projectId, tenantId }, select: { id: true } });
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const newPackage = await prisma.package.create({
      data: {
        projectId,
        name,
        scopeSummary: scopeSummary ?? scope ?? null,
        trade,
        budgetEstimate: budgetEstimate != null ? toDecimal(budgetEstimate, { fallback: 0 }) : null,
        deadline: deadline ? new Date(deadline) : null,
      },
      include: {
        awardSupplier: { select: { id: true, name: true } },
        contracts: {
          where: { tenantId },
          orderBy: { createdAt: 'desc' },
          include: { supplier: { select: { id: true, name: true } } },
        },
      },
    });
    await writeAudit({
      prisma,
      req,
      userId: req.user?.id,
      entity: 'Package',
      entityId: newPackage.id,
      action: 'CREATE',
      changes: { name, trade, scopeSummary: newPackage.scopeSummary },
    });
    res.status(201).json(serializePackage(newPackage));
  } catch (err) {
    console.error('Error creating package:', err);
    res.status(500).json({ error: 'Could not create package' });
  }
};

// List contracts for a project
exports.listContractsByProject = async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const projectId = Number(req.params.projectId);
    const contracts = await prisma.contract.findMany({
      where: { tenantId, projectId },
      include: {
        supplier: { select: { name: true, id: true } },
        package: { select: { name: true, id: true } }
      }
    });
    res.json(contracts);
  } catch (err) {
    console.error('Error listing contracts:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};
