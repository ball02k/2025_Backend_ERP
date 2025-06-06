const express = require("express");
const { PrismaClient } = require("@prisma/client");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const csv = require("csv-parser");

const app = express();
const prisma = new PrismaClient();
const upload = multer({ dest: "uploads/" });

app.use(cors({
  origin: "http://localhost:5174",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type"]
}));
app.use(express.json());

// 🔍 Get all projects
app.get("/projects", async (req, res) => {
  try {
    const projects = await prisma.project.findMany({
      include: {
        client: true, // ✅ fetch full client info
      },
    });
    res.json(projects);
  } catch (err) {
    console.error("Failed to fetch projects:", err);
    res.status(500).json({ error: "Failed to fetch projects" });
  }
});

// ➕ Create a new project
//   Create a new project
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
      budget: parseFloat(req.body.budget) || 0,
    };

    if (req.body.client_id) {
      data.client = {
        connect: { id: parseInt(req.body.client_id) },
      };
    }

    const project = await prisma.project.create({ data });
    res.json(project);
  } catch (err) {
    console.error("Prisma error on create:", err);
    res.status(500).json({ error: "Failed to create project" });
  }
});

// 📁 Upload projects via CSV


app.post('/upload-csv', upload.single('file'), async (req, res) => {
  const results = [];
  fs.createReadStream(req.file.path)
    .pipe(csv())
    .on('data', (row) => {
      results.push(row);
    })
    .on('end', async () => {
const createdProjects = [];
const skippedRows = [];

for (const row of results) {
  try {
    const issues = [];

    // 🔍 Validate dates
    if (row.start_date && isNaN(new Date(row.start_date))) {
      issues.push("invalid start_date");
    }
    if (row.end_date && isNaN(new Date(row.end_date))) {
      issues.push("invalid end_date");
    }

    // 🔍 Check for missing or invalid client_id
    let clientConnect = undefined;
    if (row.client_id) {
      const clientExists = await prisma.client.findUnique({
        where: { id: parseInt(row.client_id, 10) },
      });

      if (!clientExists) {
        issues.push("missing client_id");
      } else {
        clientConnect = { connect: { id: parseInt(row.client_id, 10) } };
      }
    } else {
      issues.push("missing client_id");
    }

    // 🔍 Check for duplicate project_code
    const existing = await prisma.project.findUnique({
      where: { project_code: row.project_code },
    });

    if (existing) {
      issues.push("duplicate project_code");
    }

    // ❌ If any issues, skip this row
    if (issues.length > 0) {
      skippedRows.push({
        project_code: row.project_code,
        project_name: row.project_name,
        issues,
      });
      continue;
    }

    // ✅ All good, create the project
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
        budget: parseFloat(row.budget) || 0,
      },
    });

    // If the CSV includes a tasks column, create tasks linked to this project
    if (row.tasks) {
      const taskNames = row.tasks.split(';').map(t => t.trim()).filter(Boolean);
      for (const taskName of taskNames) {
        await prisma.task.create({
          data: {
            project: { connect: { id: created.id } },
            name: taskName,
          },
        });
      }
    }

    createdProjects.push(created);
  } catch (err) {
    skippedRows.push({
      project_code: row.project_code,
      project_name: row.project_name,
      issues: ["unexpected error"],
    });
  }
}

res.json({
  message: 'CSV upload complete',
  count: createdProjects.length,
  skipped: skippedRows
});
    });
});

// 🔍 Get all tasks
app.get("/tasks", async (req, res) => {
  try {
    const tasks = await prisma.task.findMany({ include: { project: true } });
    res.json(tasks);
  } catch (err) {
    console.error("Failed to fetch tasks:", err);
    res.status(500).json({ error: "Failed to fetch tasks" });
  }
});

// 🔍 Get a single task by ID
app.get("/tasks/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const task = await prisma.task.findUnique({
      where: { id: parseInt(id, 10) },
      include: { project: true },
    });

    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }

    res.json(task);
  } catch (err) {
    console.error("Failed to fetch task by ID:", err);
    res.status(500).json({ error: "Failed to fetch task" });
  }
});

// ➕ Create a new task
app.post("/tasks", async (req, res) => {
  const { project_id, name, description, status, due_date } = req.body;

  if (!project_id) {
    return res.status(400).json({ error: "project_id is required" });
  }

  try {
    const task = await prisma.task.create({
      data: {
        project: { connect: { id: parseInt(project_id, 10) } },
        name,
        description: description || null,
        status: status || undefined,
        due_date: due_date ? new Date(due_date) : null,
      },
    });
    res.json(task);
  } catch (err) {
    console.error("Failed to create task:", err);
    res.status(500).json({ error: "Failed to create task" });
  }
});

// ✏️ Update a task
app.put("/tasks/:id", async (req, res) => {
  const { id } = req.params;
  const { project_id, name, description, status, due_date } = req.body;

  try {
    const task = await prisma.task.update({
      where: { id: parseInt(id, 10) },
      data: {
        project: project_id ? { connect: { id: parseInt(project_id, 10) } } : undefined,
        name,
        description: description || null,
        status: status || undefined,
        due_date: due_date ? new Date(due_date) : null,
      },
    });
    res.json(task);
  } catch (err) {
    console.error("Failed to update task:", err);
    res.status(500).json({ error: "Failed to update task" });
  }
});

// ❌ Delete a task
app.delete("/tasks/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.task.delete({ where: { id: parseInt(id, 10) } });
    res.json({ message: "Task deleted" });
  } catch (err) {
    console.error("Failed to delete task:", err);
    res.status(500).json({ error: "Failed to delete task" });
  }
});

// 🚀 Start the server
// 🔍 Get all clients
// 🔍 Get all clients
app.get("/clients", async (req, res) => {
  try {
    const clients = await prisma.client.findMany();
    res.json(clients);
  } catch (err) {
    console.error("Failed to fetch clients:", err);
    res.status(500).json({ error: "Failed to fetch clients" });
  }
});
// 🔍 Get a single client by ID
app.get("/clients/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const client = await prisma.client.findUnique({
      where: { id: parseInt(id, 10) },
    });

    if (!client) {
      return res.status(404).json({ error: "Client not found" });
    }

    res.json(client);
  } catch (err) {
    console.error("Failed to fetch client by ID:", err);
    res.status(500).json({ error: "Failed to fetch client" });
  }
});

app.listen(3001, () => console.log("Server running on http://localhost:3001"));

// ➕ Add new client
app.post("/clients", async (req, res) => {
  const { name, company_number, vat_number } = req.body;

  if (!name || name.trim() === "") {
    return res.status(400).json({ error: "Client name is required" });
  }

  try {
    const client = await prisma.client.create({
      data: {
        name,
        company_reg: company_number || null,
        vat_number: vat_number || null,
      },
    });
    res.json(client);
  } catch (err) {
    console.error("Failed to create client:", err);
    res.status(500).json({ error: "Failed to create client" });
  }
});
