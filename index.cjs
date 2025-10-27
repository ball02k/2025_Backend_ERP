const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const csv = require("csv-parser");
const prisma = require("./lib/prisma.cjs");
const contractsRouter = require("./routes/contracts.cjs");

/*
 * Construction ERP backend
 *
 * This Express server exposes a set of generic CRUD routes for every
 * Prisma model in the application.  It also defines a handful of
 * bespoke endpoints to support project‑scoped queries (e.g. "get all
 * tenders for project 1"), file uploads, and CSV imports.  The CORS
 * configuration permits the React development server on port 5174
 * access to these APIs【904191108398894†L11-L15】.  See the corresponding
 * Prisma schema for model definitions.
 */

const app = express();
const upload = multer({ dest: "uploads/" });

// Allow the Vite dev server on port 5174 to call this API【904191108398894†L11-L15】.
app.use(cors({
  origin: "http://localhost:5174",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type"]
}));
app.use(express.json());
app.use("/contracts", contractsRouter);

// Mapping of Prisma model keys to API route names.  Adding a model
// here automatically wires up generic CRUD endpoints for it.  The
// keys correspond to the lower‑camel–cased Prisma model names (e.g.
// model Inventory ➞ prisma.inventory) and the values are the plural
// path segments exposed via HTTP.  See the schema.prisma for the
// definitions of these models.
const routeMap = {
  company: 'companies',
  user: 'users',
  milestone: 'milestones',
  contact: 'contacts',
  subtask: 'subtasks',
  comment: 'comments',
  supplier: 'suppliers',
  procurement: 'procurements',
  complianceRecord: 'compliance-records',
  costEntry: 'cost-entries',
  cvrReport: 'cvr-reports',
  report: 'reports',
  file: 'files',
  projectTeamMember: 'project-team-members',
  auditLog: 'audit-logs',
  aIAlert: 'ai-alerts',
  // new models
  inventory: 'inventory',
  carbonRecord: 'carbon-records',
  risk: 'risks',
  timelineEvent: 'timeline-events',
  healthSafetyRecord: 'health-safety-records',
  tender: 'tenders',
  subcontractor: 'subcontractors'
};

// Generic CRUD route registration.  For every entry in routeMap we
// register GET, POST, PUT and DELETE routes.  If you add a new
// Prisma model, add it to the map above to enable these endpoints.
for (const [modelKey, path] of Object.entries(routeMap)) {
  const model = prisma[modelKey];
  if (!model) continue;

  // GET /<path>
  app.get(`/${path}`, async (req, res) => {
    try {
      const items = await model.findMany();
      res.json(items);
    } catch (err) {
      res.status(500).json({ error: `Failed to fetch ${path}` });
    }
  });

  // GET /<path>/:id
  app.get(`/${path}/:id`, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid id' });
    }
    try {
      const item = await model.findUnique({ where: { id } });
      if (!item) return res.status(404).json({ error: `${modelKey} not found` });
      res.json(item);
    } catch (err) {
      res.status(500).json({ error: `Failed to fetch ${modelKey}` });
    }
  });

  // POST /<path>
  app.post(`/${path}`, async (req, res) => {
    try {
      const created = await model.create({ data: req.body });
      res.json(created);
    } catch (err) {
      res.status(500).json({ error: `Failed to create ${modelKey}` });
    }
  });

  // PUT /<path>/:id
  app.put(`/${path}/:id`, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid id' });
    }
    try {
      const updated = await model.update({
        where: { id },
        data: req.body
      });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: `Failed to update ${modelKey}` });
    }
  });

  // DELETE /<path>/:id
  app.delete(`/${path}/:id`, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid id' });
    }
    try {
      await model.delete({ where: { id } });
      res.json({ message: `${modelKey} deleted` });
    } catch (err) {
      res.status(500).json({ error: `Failed to delete ${modelKey}` });
    }
  });
}

// ------------------------
// Project‑scoped APIs
//
// The frontend requests information scoped to a single project
// (e.g. `/api/projects/1/tenders`).  These endpoints extract the
// project id from the URL and query the appropriate Prisma model.

// Project info for the "Info" tab
app.get("/api/projects/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    return res.status(400).json({ error: "Invalid id" });
  }
  try {
    const project = await prisma.project.findUnique({
      where: { id },
      include: { client: true }
    });
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }
    const {
      project_name,
      type,
      contract_type,
      sector,
      project_manager,
      quantity_surveyor,
      address_line1,
      address_line2,
      city,
      postcode,
      client
    } = project;
    res.json({
      name: project_name,
      type,
      contract_type,
      sector,
      project_manager,
      qs: quantity_surveyor,
      address_line1,
      address_line2,
      city,
      postcode,
      client: client ? { id: client.id, name: client.name } : null
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch project" });
  }
});

// Helper to create project‑specific route
function registerProjectListRoute(path, modelKey) {
  app.get(`/api/projects/:id/${path}`, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid id" });
    }
    try {
      const items = await prisma[modelKey].findMany({ where: { project_id: id } });
      res.json(items);
    } catch (err) {
      res.status(500).json({ error: `Failed to fetch ${path}` });
    }
  });
}

// Register project‑list routes for existing and new models.  The
// property names must match the Prisma model names in lower camel
// case, and the paths reflect what the frontend expects (e.g.
// `/api/projects/:id/cvr` returns CVR reports).  See the React
// components for usage【224507520938991†L47-L55】.
registerProjectListRoute('cvr', 'cvrReport');
registerProjectListRoute('cost', 'costEntry');
registerProjectListRoute('tenders', 'tender');
registerProjectListRoute('inventory', 'inventory');
registerProjectListRoute('carbon', 'carbonRecord');
registerProjectListRoute('risks', 'risk');
registerProjectListRoute('timeline', 'timelineEvent');
registerProjectListRoute('hse', 'healthSafetyRecord');

// Endpoint to upload files and associate them with a project
app.post('/api/projects/:id/files', upload.single('file'), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    return res.status(400).json({ error: "Invalid id" });
  }
  if (!req.file) {
    return res.status(400).json({ error: 'File is required' });
  }
  try {
    const created = await prisma.file.create({
      data: {
        filename: req.file.originalname,
        url: `/uploads/${req.file.filename}`,
        file_type: req.file.mimetype,
        project: { connect: { id } }
      }
    });
    res.json(created);
  } catch (err) {
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// Project list and task endpoints remain unchanged from the original
// server.  They provide CRUD operations for projects and tasks,
// plus CSV import functionality.

// GET all projects
app.get("/projects", async (req, res) => {
  try {
    const projects = await prisma.project.findMany({ include: { client: true } });
    res.json(projects);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch projects" });
  }
});

// Alias `/api/projects` → `/projects` for frontend compatibility.  The
// React application fetches `/api/projects` via the proxy, so expose
// the same data under this route.
app.get('/api/projects', async (req, res) => {
  try {
    const projects = await prisma.project.findMany({ include: { client: true } });
    res.json(projects);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

// Create a new project
app.post("/projects", async (req, res) => {
  try {
    const data = {
      project_code: req.body.project_code || null,
      project_name: req.body.project_name,
      description: req.body.description || null,
      start_date: req.body.start_date ? new Date(req.body.start_date) : null,
      end_date: req.body.end_date ? new Date(req.body.end_date) : null,
      status: req.body.status || "Planned",
      location: req.body.location || "",
      budget: parseFloat(req.body.budget) || 0
    };
    if (req.body.client_id) {
      data.client = { connect: { id: parseInt(req.body.client_id) } };
    }
    const project = await prisma.project.create({ data });
    res.json(project);
  } catch (err) {
    res.status(500).json({ error: "Failed to create project" });
  }
});

// CSV upload for projects
app.post('/upload-csv', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'File is required' });
  }
  const results = [];
  fs.createReadStream(req.file.path)
    .pipe(csv())
    .on('data', (row) => { results.push(row); })
    .on('end', async () => {
      const createdProjects = [];
      const skippedRows = [];
      for (const row of results) {
        try {
          const issues = [];
          if (row.start_date && isNaN(new Date(row.start_date))) issues.push("invalid start_date");
          if (row.end_date && isNaN(new Date(row.end_date))) issues.push("invalid end_date");
          let clientConnect;
          if (row.client_id) {
            const clientExists = await prisma.client.findUnique({ where: { id: parseInt(row.client_id, 10) } });
            if (!clientExists) {
              issues.push("missing client_id");
            } else {
              clientConnect = { connect: { id: parseInt(row.client_id, 10) } };
            }
          } else {
            issues.push("missing client_id");
          }
          const existing = await prisma.project.findUnique({ where: { project_code: row.project_code } });
          if (existing) issues.push("duplicate project_code");
          if (issues.length > 0) {
            skippedRows.push({ project_code: row.project_code, project_name: row.project_name, issues });
            continue;
          }
          const created = await prisma.project.create({
            data: {
              project_code: row.project_code,
              project_name: row.project_name,
              description: row.description || null,
              start_date: new Date(row.start_date),
              end_date: new Date(row.end_date),
              client: clientConnect,
              status: row.status || "Planned",
              location: row.location || "",
              budget: parseFloat(row.budget) || 0
            }
          });
          if (row.tasks) {
            const taskNames = row.tasks.split(';').map(t => t.trim()).filter(Boolean);
            for (const taskName of taskNames) {
              await prisma.task.create({ data: { project: { connect: { id: created.id } }, name: taskName } });
            }
          }
          createdProjects.push(created);
        } catch (err) {
          skippedRows.push({ project_code: row.project_code, project_name: row.project_name, issues: ["unexpected error"] });
        }
      }
      res.json({ message: 'CSV upload complete', count: createdProjects.length, skipped: skippedRows });
      fs.unlink(req.file.path, () => {});
    });
});

// Generic CSV upload for any model
app.post('/upload-csv/:model', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'File is required' });
  }
  const { model } = req.params;
  const prismaModel = prisma[model];
  if (!prismaModel) {
    return res.status(400).json({ error: 'Invalid model' });
  }
  const rows = [];
  fs.createReadStream(req.file.path)
    .pipe(csv())
    .on('data', (row) => rows.push(row))
    .on('end', async () => {
      let count = 0;
      for (const row of rows) {
        try {
          await prismaModel.create({ data: row });
          count++;
        } catch (err) {
          // skip invalid rows
        }
      }
      res.json({ message: 'CSV upload complete', count });
      fs.unlink(req.file.path, () => {});
    });
});

// Task CRUD routes
app.get("/tasks", async (req, res) => {
  try {
    const tasks = await prisma.task.findMany({ include: { project: true } });
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch tasks" });
  }
});

// Alias `/api/tasks` → `/tasks` for frontend compatibility.
app.get('/api/tasks', async (req, res) => {
  try {
    const tasks = await prisma.task.findMany({ include: { project: true } });
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// Alias `/api/reports` → `/reports`.  Returns all reports with their
// associated projects and authors.
app.get('/api/reports', async (req, res) => {
  try {
    const reports = await prisma.report.findMany({ include: { project: true, author: true } });
    res.json(reports);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
});
app.get("/tasks/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  try {
    const task = await prisma.task.findUnique({ where: { id }, include: { project: true } });
    if (!task) return res.status(404).json({ error: "Task not found" });
    res.json(task);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch task" });
  }
});
app.post("/tasks", async (req, res) => {
  const { project_id, name, description, status, due_date } = req.body;
  if (!project_id) return res.status(400).json({ error: "project_id is required" });
  try {
    const task = await prisma.task.create({
      data: {
        project: { connect: { id: parseInt(project_id, 10) } },
        name,
        description: description || null,
        status: status || undefined,
        due_date: due_date ? new Date(due_date) : null
      }
    });
    res.json(task);
  } catch (err) {
    res.status(500).json({ error: "Failed to create task" });
  }
});
app.put("/tasks/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const { project_id, name, description, status, due_date } = req.body;
  try {
    const task = await prisma.task.update({
      where: { id },
      data: {
        project: project_id ? { connect: { id: parseInt(project_id, 10) } } : undefined,
        name,
        description: description || null,
        status: status || undefined,
        due_date: due_date ? new Date(due_date) : null
      }
    });
    res.json(task);
  } catch (err) {
    res.status(500).json({ error: "Failed to update task" });
  }
});
app.delete("/tasks/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  try {
    await prisma.task.delete({ where: { id } });
    res.json({ message: "Task deleted" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete task" });
  }
});

// Client endpoints
app.get("/clients", async (req, res) => {
  try {
    const clients = await prisma.client.findMany();
    res.json(clients);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch clients" });
  }
});
app.get("/clients/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  try {
    const client = await prisma.client.findUnique({ where: { id } });
    if (!client) return res.status(404).json({ error: "Client not found" });
    res.json(client);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch client" });
  }
});
app.post("/clients", async (req, res) => {
  const { name, registration_number, vat_number } = req.body;
  if (!name || name.trim() === "") return res.status(400).json({ error: "Client name is required" });
  try {
    const client = await prisma.client.create({ data: { name, registration_number: registration_number || null, vat_number: vat_number || null } });
    res.json(client);
  } catch (err) {
    res.status(500).json({ error: "Failed to create client" });
  }
});

// Start the server
app.listen(3001, () => console.log("Server running on http://localhost:3001"));