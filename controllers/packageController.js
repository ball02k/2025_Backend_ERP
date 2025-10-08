const { prisma } = require('../utils/prisma.cjs');

// List packages for a project (with basic info and submission count)
exports.listPackages = async (req, res) => {
  try {
    const projectId = Number(req.params.projectId);
    const packages = await prisma.package.findMany({
      where: { projectId },
      include: {
        awardSupplier: { select: { name: true, id: true } },
        tenders: { select: { id: true, status: true, title: true } },
        _count: { select: { submissions: true } },
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
    res.json(packages);
  } catch (err) {
    console.error('Error listing packages:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Create a new package under a project
exports.createPackage = async (req, res) => {
  try {
    const projectId = Number(req.params.projectId);
    const { name, scope, trade, budgetEstimate, deadline } = req.body;
    const newPackage = await prisma.package.create({
      data: {
        projectId,
        name,
        scope,
        trade,
        budgetEstimate,
        deadline: deadline ? new Date(deadline) : null
      }
    });
    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        entity: 'Package',
        entityId: String(newPackage.id),
        action: 'CREATE',
        changes: { set: req.body }
      }
    });
    res.status(201).json(newPackage);
  } catch (err) {
    console.error('Error creating package:', err);
    res.status(500).json({ error: 'Could not create package' });
  }
};

// List contracts for a project
exports.listContractsByProject = async (req, res) => {
  try {
    const projectId = Number(req.params.projectId);
    const contracts = await prisma.contract.findMany({
      where: { projectId },
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
