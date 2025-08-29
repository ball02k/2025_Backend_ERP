FRONTEND_REPORT.md
Overview & Build Surface
Build tooling: Vite with React plugin; Tailwind CSS enabled via PostCSS (tailwindcss + autoprefixer). Dev server proxies API routes to http://localhost:3001 for /api, /auth, /me, and /files

Tailwind theme: custom brand blue‑grey palette and status colours (ok, warn, bad, info) extend the default theme

Dev scripts: npm run dev starts Vite; other scripts include build, lint, test, and a guard preventing chart.js imports

Route & Navigation Map
graph TD
  home["/"]
  home --> projects["/projects"]
  projects --> projDetails["/projects/:id"]
  home --> clients["/clients"]
  clients --> clientDetails["/clients/:id"]
  home --> tasks["/tasks"]
  tasks --> taskDetails["/tasks/:id"]
  home --> suppliers["/suppliers (nav only)"]
  home --> procurement["/procurement (nav only)"]
  home --> cvr["/cvr (nav only)"]
  home --> carbon["/carbon (nav only)"]
  home --> documents["/documents (nav only)"]
  home --> reports["/reports (nav only)"]
  home --> settings["/settings (nav only)"]
Pages /suppliers, /procurement, /cvr, /carbon, /documents, /reports, and /settings are listed in the sidebar but lack route implementations

Data Wiring Inventory
Page/Widget	Endpoints & Params	Expected Fields	State Handling
ModuleBlocks (Active Projects, Overdue Tasks)	/projects, /tasks?limit=50&sort=dueDate:asc	projects: {id, name, code, status, type, client.name}, tasks: {id, title, dueDate, status}	Skeleton loaders; errors logged to console only
DashboardWidgets	None – uses static default props	Static numbers for project status, budget, tasks, margin	No loading/error handling (data binding missing)
ProjectsPage	/projects?q&status&type&limit&offset&sort	Array at data.items / data.projects / data.data; fields code, name, client.name, status, budget	Loading & error messages; empty-state notice
ProjectDetailsPage	/projects/:id (load); /projects/:id or /projects (save)	name, code, status, type, client.name, projectManager	Toast errors; no explicit empty state
ClientsPage	/clients?q&limit&offset&sort	name, industry, numberOfProjects, totalSpend	Loading & error messages; empty-state notice
ClientDetailsPage	/clients/:id + /projects (filtered clientId)	client: {name, companyNumber}, projects[]	No error handling for project fetch; empty list message
TasksPage	/tasks?q&status&type&limit&offset&sort	title, status, type, assignedTo, dueDate, project.name	Loading & error messages; empty-state notice
TaskDetailsPage	/tasks/:id (load); /tasks/:id or /tasks/delete (delete)	title, status, dueDate, project.name	Delete confirmation dialog; no explicit error on load
GlobalSearchBar	/clients, /projects, /tasks?limit=50	Arrays for clients, projects, tasks; each item expects id, name/title, status/type	Loading state and “No matches” messaging
QuickCreateModal	Load lists: /clients, /projects; create: /clients, /projects, /tasks	Client {name, companyRegNo}, Project {name, code, status, type, clientId}, Task {title, status, dueDate, projectId}	Form-level error messages; no global error display
Linkage Gaps
Active project and overdue task items on the home dashboard are plain text; users cannot navigate to project or task details from this widget

Client name in ProjectDetails is not clickable, breaking entity interlinking

In ClientDetailsPage, project name rows use a separate “Open” link rather than making the name itself clickable, reducing discoverability

Sidebar links exist for Suppliers/Procurement/CVR/Carbon/Documents/Reports/Settings but routes are missing, leading to 404s when clicked

API Mismatch Findings
Several components anticipate legacy fields:

Projects expect client_name or nested client.name; new APIs may return only clientId

Client details filter projects by both clientId and client.id, indicating uncertainty in backend contract

Budget widgets sum budget, estimatedBudget, actualSpend, actual_cost, and committedCost, requiring a consistent schema from the backend

Auth & Base URL Issues
API client builds URLs from VITE_API_BASE_URL, defaulting to http://localhost:3001/api, and attaches Authorization headers from storage

Reported 404s to /api/clients likely stem from misconfigured VITE_API_BASE_URL or dev proxy usage, causing requests to hit the frontend origin instead of the proxy.

401s can occur if pages render before ensureDevSession obtains a token; ModuleBlocks and others guard with isAuthed() but rely on local storage token availability

UI/UX Regressions
Home dashboard widgets no longer reflect live data because DashboardWidgets uses static defaults

Top bar alignment issues reported: search bar, “+ New” button, and notification icons rely on flex spacing without responsive fallbacks, potentially misaligning on narrow viewports

Notification panel slides in/out via translate-x transforms; closing the panel still leaves a backdrop mounted, which may trap scroll focus

CSV/OCR/API Hooks
Repository search returned no CSV import/export utilities or references, indicating these features are unimplemented across modules

No stubs found for OCR or external integrations (Companies House, Creditsafe, HMRC).

Read-only Next Steps (Frontend)
Priority	Task	Effort
High	Wire DashboardWidgets to real metrics via /projects/summary, /tasks/summary APIs; handle loading/error states.	M
High	Ensure all entity names in widgets and detail panels are <Link> components (ModuleBlocks, ClientDetails, ProjectDetails).	S
High	Standardize project/client field names (clientId, client.name) and update components to match backend responses.	M
Medium	Add CSV import/export buttons with file validators in list views (ProjectsPage, ClientsPage, TasksPage).	L
Medium	Review VITE_API_BASE_URL and dev proxy configuration so GlobalSearchBar requests hit backend correctly.	S
Medium	Add responsive flex rules in TopBar to keep search, “+ New”, and icons aligned on small screens.	S
Low	Introduce stubs for OCR and external APIs (Companies House, Creditsafe, HMRC) to document future integrations.	M
Low	Audit for white-on-white text occurrences and consolidate text color tokens to avoid regressions.	S
End of report.
