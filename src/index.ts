import express from "express";
import cors from "cors";
import projects from "./routes/projects";
import clients from "./routes/clients";
import tasks from "./routes/tasks";

const app = express();
app.use(cors({ origin: "http://localhost:5174" }));
app.use(express.json());

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api/projects", projects);
app.use("/api/clients", clients);
app.use("/api/tasks", tasks);

const port = Number(process.env.PORT || 3001);
app.listen(port, () => console.log(`API listening on http://localhost:${port}`));
