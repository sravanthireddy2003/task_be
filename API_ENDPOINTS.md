# Task Management API - Role Segmented Reference

## Routing Overview
- **Base prefix:** All entry points live under `/api` so the shared JWT guard, body parser, and CORS policies apply consistently.
- **Role routers:** `admin`, `manager`, `employee`, and `clients` now each have a dedicated router (`routes/adminRoutes.js`, `routes/managerRoutes.js`, `routes/employeeRoutes.js`, `routes/clientRoutes.js`) mounted at `/api/{role}` to isolate responsibilities.
- **Shared services:** Projects, tasks, and subtasks remain under `/api/projects` because those operations are shared between admin, manager, and client viewers (see the Projects & Task Engine section).

## Authentication & Authorization
- Every request must carry a valid JWT in the `Authorization: Bearer <token>` header.
- `middleware/auth` validates the JWT and loads the user record; `middleware/role.allowRoles` enforces role boundaries before any controller runs.
- `RoleBasedLoginResponse` is used inside manager/employee controllers to keep data scoped to the features and resource lists returned at login.

---

## Administrator APIs (`/api/admin`)
| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/dashboard` | Tenant-level counts for users, projects, and tasks. |
| `GET` | `/users` | Lists every user (`_id`, `public_id`, `name`, `email`, `role`, `isActive`, `tenant_id`). |
| `GET` | `/clients` | Full client list; optional `userId` query can scope by creator/manager (`_id` or `public_id`). |
| `GET` | `/departments` | Departments with manager/head info (public IDs populated when present). |
| `POST` | `/departments` | Create a department. Requires `name` and `managerId`; accepts `headId`, audit columns, and optional `public_id`. |
| `PUT` | `/departments/:id` | Partial updates to names, manager/head assignments, and metadata. |
| `DELETE` | `/departments/:id` | Soft delete a department entry. |
| `GET` | `/modules` | Reads the module manifest (`data/modules.json`). |
| `GET` | `/modules/:id` | Reads a sorted module entry. |
| `POST` | `/modules` | Adds a module record to the manifest. |
| `PUT` | `/modules/:id` | Updates module metadata. |
| `DELETE` | `/modules/:id` | Removes a module from the manifest. |

> All admin endpoints are wrapped with `allowRoles('Admin')`, so no non-admin token can reach this table.

---

## Manager APIs (`/api/manager`)
| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/dashboard` | `projectCount`, `taskCount`, `clientCount`, all filtered via `RoleBasedLoginResponse` and the manager’s assigned clients. |
| `GET` | `/clients` | Returns the `assignedClientIds` returned at login; the payload is limited to managers’ assigned clients. |
| `GET` | `/projects` | Projects owned by `manager_id` / `project_manager_id`, joined with the client name/public ID. |
| `GET` | `/timeline` | Task timeline for all assigned projects. Each entry returns grouped assigned users and client metadata. |
| `GET` | `/tasks` | Alias for `/timeline` so managers can fetch all scoped tasks without the timeline label. |
| `POST` | `/project` | Creates a manager-owned project (requires `name`, `tenant_id`, optional `description`, `client_id`). |
| `PUT` | `/project/:id` | Updates manager-owned project metadata. |
| `POST` | `/task/reassign` | Updates `tasks.assigned_to`; requires `taskId` & `newUserId`. |

> Manager routes honor the `Dashboard`, `Projects`, `Tasks`, and `Assigned Clients` feature flags from the login response, so feature/feature flags plus tenant-data are kept in sync with the client.

---

## Employee APIs (`/api/employee`)
| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/my-tasks` | Employees only see tasks assigned to `req.user.id`. Filters automatically by the user’s tenant when applicable and excludes deleted work. |
| `POST` | `/subtask` | Creates a pending subtask. Requires `taskId` and `title`; the controller validates the task belongs to the employee. |
| `PUT` | `/subtask/:id` | Updates a subtask only after verifying the parent task is assigned to the employee. |

> The employee router only works when the login payload lists the `Assigned Tasks` feature, so unauthorized employees get descriptive 403 responses.

---

## Client APIs (`/api/clients`)
`routes/clientRoutes.js` wraps `controller/ClientsApi.js`, so the entire client surface is now grouped at `/api/clients`.
| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/` | Admin-only client creation. Accepts `name`, `company`, optional addresses, `gstNumber`, `managerId`, contacts, documents, and portal flags like `enableClientPortal`. Automatically creates contact users when `contacts` or portal flags are provided. |
| `GET` | `/` | Lists clients; accessible to Admin, Manager, and Client-Viewer roles. Supports `userId` filtering (internal `_id` or `public_id`). |
| `GET` | `/:id` | Single client detail for authorized roles. |
| `PUT` | `/:id` | Updates client metadata (Admin/Manager). Handles optional columns like `district`, `state`, or `user_id`. |
| `DELETE` | `/:id` | Soft delete (Admin only). |
| `POST` | `/:id/restore` | Restores a soft-deleted client. |
| `DELETE` | `/:id/permanent` | Hard delete (Admin only). |
| `POST` | `/:id/assign-manager` | Reassigns managers. |
| `POST` | `/:id/create-viewer` | Creates/updates portal viewers and emails credentials. |
| `GET` | `/:id/viewers/:userId` | Reads a viewer mapping (Admin/Manager). |
| `PUT` | `/:id/viewers/:userId/modules` | Adjusts viewer module access. |
| `POST` | `/:id/contacts` | Adds a contact (Admin/Manager). |
| `PUT` | `/:id/contacts/:contactId` | Updates contact info. |
| `DELETE` | `/:id/contacts/:contactId` | Removes a contact. |
| `POST` | `/:id/contacts/:contactId/set-primary` | Sets a contact as primary. |
| `POST` | `/:id/documents` | Attaches document metadata (Admin/Manager). |
| `POST` | `/:id/upload` | Uploads up to 20 multipart files (Admin/Manager). |

> Client routes run through `clientViewerAccessControl`, so client viewers are limited to the whitelisted endpoints while admin/manager users retain full access.

---

## Projects & Task Engine (`/api/projects`)
`routes/projectRoutes.js` mounts the `Tasks`, `Subtasks`, and `Projects` routers. Every endpoint is protected by `middleware/roles.requireAuth`.

### Tasks (`/api/projects/tasks`)
- `POST /api/projects/tasks` – Create a task (Admin/Manager). Send `title`, `description`, `priority`, `stage`, `taskDate`, `assigned_to`, `client_id`, `projectId`, `projectPublicId`, and `time_alloted`.
- `GET /api/projects/tasks` – List tasks filtered by `project_id` or `projectPublicId`. The response includes client info, assigned users, priority, stage, and timestamps.
- `PUT /api/projects/tasks/:id` – Partial updates to any allowed field (stage, assignment, time, priority, etc.).
- `DELETE /api/projects/tasks/:id` – Soft delete and cascade deletions through related rows (tasks, assignments, hours, activity).

### Subtasks (`/api/projects/subtasks`)
- `POST /api/projects/subtasks` – Create a subtask (Admin/Manager). Requires `task_id` and `title`.
- `PUT /api/projects/subtasks/:id` – Update status/title data.
- `DELETE /api/projects/subtasks/:id` – Soft delete.

### Projects (`/api/projects`)
- `GET /api/projects` – Project listings with associated client data.
- `POST /api/projects` – Create a project. Supports `name`, `description`, `client_id`, `manager_id`, `start_date`, `end_date`, `status`, and `priority`.
- `PUT /api/projects/:id` – Update metadata.
- `DELETE /api/projects/:id` – Delete project entries.

---

## Feature & Access Notes
- `RoleBasedLoginResponse` seeds `assignedClientIds`, `features`, and `restrictions` at login. Manager/employee controllers only return assigned data and reject requests when the feature flag is missing.
- Employees rely on the `Assigned Tasks` feature to create/update subtasks and list their own tasks.
- Client viewers run through `middleware/clientViewer` so they cannot call admin-only endpoints.

---

## Sample cURL Snippets
### Manager dashboard
```bash
curl -H "Authorization: Bearer <token>" "http://localhost:4000/api/manager/dashboard"
```

### Employee create subtask
```bash
curl -X POST http://localhost:4000/api/employee/subtask \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"taskId":162,"title":"QA review"}'
```

### Client creation (admin only)
```bash
curl -X POST http://localhost:4000/api/clients \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"ACME Co","company":"ACME","managerId":123,"status":"Active"}'
```

### Task creation
```bash
curl -X POST http://localhost:4000/api/projects/tasks \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"title":"New feature","assigned_to":[23],"projectId":13,"priority":"HIGH"}'
```
