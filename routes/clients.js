const express = require('express');
module.exports = (prisma) => {
  const router = express.Router();
  router.get('/', async (req, res) => {
    try {
      const tenantId = req.user.tenantId;
      const clients = await prisma.client.findMany({
        where: { projects: { some: { tenantId } } },
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          companyRegNo: true,
          projects: { where: { tenantId }, select: { id: true } },
        },
      });
      const result = clients.map((c) => ({
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

