# Workflow Module API — Developer Spec

COMMON HEADERS (ALL PROTECTED ROUTES)
- `Authorization: Bearer <JWT_TOKEN>`
- `X-Tenant-Id: 1`
- `Content-Type: application/json`

STATE MACHINE (reference)
DRAFT → SUBMITTED → IN_REVIEW → APPROVED → REJECTED → ESCALATED → CLOSED

Design goals
- Multi-tenant aware (tenant via JWT or `X-Tenant-Id` header)
- Role-based endpoints: Admin, Manager, Employee, System
- Rule-driven routing (uses business_rules engine)
- SLA worker emits Socket.IO events on escalation
- Audit entries on all state transitions

---

**ADMIN APIs**

1) Create Workflow Template
POST /api/admin/workflows/templates

Request Body
{
  "tenant_id": 1,
  "name": "HR Payroll Task Approval",
  "trigger_event": "TASK_REVIEW",
  "department_id": 3,
  "department_name": "HR",
  "project_id": 45,
  "project_name": "Payroll System",
  "active": true,
  "created_by": 1
}

Response (201)
{
  "success": true,
  "message": "Workflow template created",
  "data": {
    "id": 7,
    "scope": "PROJECT",
    "tenant_id": 1,
    "name": "HR Payroll Task Approval",
    "trigger_event": "TASK_REVIEW",
    "active": true,
    "department": { "id": 3, "name": "HR" },
    "project": { "id": 45, "name": "Payroll System" },
    "created_by": { "id": 1, "name": "Admin User" },
    "created_at": "2026-01-23T14:00:00Z"
  }
}

2) Add Workflow Step
POST /api/admin/workflows/steps

Request Body
{
  "template_id": 7,
  "step_order": 1,
  "role": "MANAGER",
  "action": "REVIEW",
  "rule_id": 5,
  "sla_hours": 4,
  "notify": ["MANAGER"]
}

Response (201)
{
  "success": true,
  "message": "Workflow step added",
  "data": {
    "id": 21,
    "template_id": 7,
    "step_order": 1,
    "role": "MANAGER",
    "action": "REVIEW",
    "rule": { "id": 5, "name": "High Priority Rule" },
    "sla_hours": 4,
    "notify": ["MANAGER"],
    "created_at": "2026-01-23T14:05:00Z"
  }
}

3) List Templates (with steps)
GET /api/admin/workflows/templates

Response (200)
{
  "success": true,
  "meta": { "tenant_id": 1, "total": 1, "hierarchy": "PROJECT > DEPARTMENT > GLOBAL" },
  "data": [ /* templates with steps */ ]
}

---

**EMPLOYEE APIs**

4) Trigger Workflow (send task for review)
POST /api/workflow/trigger

Request Body
{
  "tenant_id": 1,
  "entity_type": "TASK",
  "entity_id": 123,
  "entity_name": "Prepare Salary Register",
  "department_id": 3,
  "department_name": "HR",
  "project_id": 45,
  "project_name": "Payroll System",
  "priority": "HIGH",
  "created_by": { "id": 7, "name": "Ramesh Kumar", "role": "EMPLOYEE" }
}

Response (202)
{
  "success": true,
  "message": "Task sent for review",
  "meta": { "resolution": "PROJECT", "template_id": 7 },
  "data": {
    "instance_id": 101,
    "current_state": "IN_REVIEW",
    "current_step": { "step_order": 1, "role": "MANAGER", "action": "REVIEW", "sla_hours": 4 },
    "next_approver": { "role": "MANAGER", "users": [{ "id": 5, "name": "Manager User" }] },
    "sla_deadline": "2026-01-23T18:00:00Z"
  }
}

5) View Workflow History
GET /api/workflow/{instanceId}/history

Response (200)
{
  "success": true,
  "data": [ /* chronological history entries */ ]
}

---

**MANAGER APIs**

6) Get Approval Queue
GET /api/manager/workflows/queue

Response (200)
{
  "success": true,
  "data": [ /* items assigned to manager */ ]
}

7) Approve Task
POST /api/manager/workflows/{instanceId}/approve
Body: { "comment": "Reviewed and approved" }

Response (200)
{
  "success": true,
  "message": "Approved by Manager",
  "data": { "instance_id": 101, "from_state": "IN_REVIEW", "to_state": "APPROVED", "next_role": "ADMIN", "sla_deadline": "2026-01-24T06:00:00Z" }
}

8) Reject Task
POST /api/manager/workflows/{instanceId}/reject
Body: { "comment": "Please attach missing documents" }

Response (200)
{ "success": true, "message": "Task rejected", "data": { "instance_id": 101, "from_state": "IN_REVIEW", "to_state": "REJECTED" } }

9) Escalate Task
POST /api/manager/workflows/{instanceId}/escalate
Body: { "reason": "Urgent payroll deadline" }

Response (200)
{ "success": true, "message": "Task escalated to Admin", "data": { "instance_id": 101, "to_state": "ESCALATED", "escalated_to": "ADMIN" } }

---

**ADMIN FINAL STEP**

10) Final Approval / Close
POST /api/admin/workflows/{instanceId}/close
Body: { "comment": "Final approval granted" }

Response (200)
{ "success": true, "message": "Workflow closed", "data": { "instance_id": 101, "final_state": "CLOSED", "task_status": "COMPLETED" } }

---

**SYSTEM (Automation)**

- SLA worker monitors `workflow_instances` and transitions instances to `ESCALATED` when SLA expired.
- Socket.IO event emitted: `workflow:escalated` with payload: { event, tenant_id, instance_id, entity, entity_id, reason }
- Audit log inserted for every transition via `auditController.log()`

---

Notes & Implementation Hints
- Tenant resolution: prefer `tenant_id` from JWT; accept `X-Tenant-Id` header as fallback.
- Rule evaluation: use `jsonRuleEngine`/`ruleEngine` to pick next role and auto-approve when rule says so.
- SLA: store `sla_deadline` per step when creating instance; SLA worker scans for expired deadlines.
- Responses should remove null fields and include `meta` wrapper where useful.

---

Sample flow (happy-path)
1) Admin creates template and 2 steps (Manager review → Admin approve)
2) Employee triggers workflow for `TASK:123`
3) Instance created, state `IN_REVIEW`, Manager notified
4) Manager approves → transitions to `APPROVED` and assigned to Admin
5) Admin closes the workflow → instance `CLOSED` and task marked `COMPLETED`

End of spec.
