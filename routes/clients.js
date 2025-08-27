const express = require('express');
module.exports = (prisma) => {
  const router = express.Router();
  router.get('/', async (req, res) => {
    try {
      const tenant = req.get('x-tenant-id') || process.env.TENANT_DEFAULT || 'demo';
      const clients = await prisma.client.findMany({
        orderBy: { name: 'asc' },
        include: {
          projects: {
            where: { tenantId: tenant },
            select: { id: true },
          },
        },
      });
      const result = clients.map(c => ({
        id: c.id,
        name: c.name,
        companyRegNo: c.companyRegNo,
        projectsCount: c.projects.length,
      }));
      res.json({ clients: result });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: err.message || 'Failed to fetch clients' });
    }
  });
  return router;
};

