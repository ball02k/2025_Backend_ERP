import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import YAML from "yaml";
import swaggerUi from "swagger-ui-express";
import projects from "./routes/projects";
import clients from "./routes/clients";
import tasks from "./routes/tasks";

const app = express();
app.use(cors({ origin: "http://localhost:5174" }));
app.use(express.json());

const openapiPath = path.join(__dirname, "..", "openapi", "openapi.yaml");
const openapiSpec = YAML.parse(fs.readFileSync(openapiPath, "utf8"));
app.get("/api/openapi.json", (_req, res) => res.json(openapiSpec));
app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(openapiSpec));

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api/projects", projects);
app.use("/api/clients", clients);
app.use("/api/tasks", tasks);

const port = Number(process.env.PORT || 3001);
app.listen(port, () => console.log(`API listening on http://localhost:${port}`));
