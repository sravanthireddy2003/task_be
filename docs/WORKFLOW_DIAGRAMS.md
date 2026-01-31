# Workflow Visual Flow Diagrams

## Complete Task Workflow

```
┌──────────────────────────────────────────────────────────────────────────┐
│                           TASK LIFECYCLE                                  │
└──────────────────────────────────────────────────────────────────────────┘

┌─────────┐
│  TODO   │  Created by Manager
└────┬────┘
     │
     │ Employee starts work
     ▼
┌─────────────┐
│ IN_PROGRESS │◄─────────┐
└─────┬───────┘          │
      │                  │ Manager REJECTS
      │ Employee submits │ (with reason)
      │ for review       │
      ▼                  │
┌──────────┐         ┌───┴──────┐
│  REVIEW  ├────────►│ REJECTED │
└────┬─────┘         └──────────┘
     │
     │ Manager APPROVES
     ▼
┌───────────┐
│ COMPLETED │  Final state
└───────────┘
```

---

## Project Closure Workflow

```
┌──────────────────────────────────────────────────────────────────────────┐
│                       PROJECT CLOSURE LIFECYCLE                           │
└──────────────────────────────────────────────────────────────────────────┘

                    ┌──────────────────┐
                    │  ACTIVE PROJECT  │
                    │                  │
                    │ Tasks: Working   │
                    └────────┬─────────┘
                             │
                             │ ✓ All tasks COMPLETED
                             │ Manager requests closure
                             ▼
              ┌──────────────────────────────┐
              │  PENDING_FINAL_APPROVAL      │
              │                              │
              │  Status Display: "PENDING_   │
              │                   CLOSURE"   │
              │  Project: LOCKED             │
              │  Tasks: LOCKED               │
              │  Can Create Tasks: NO        │
              │  Can Edit: NO                │
              └───────┬──────────────────────┘
                      │
        ┌─────────────┴─────────────┐
        │                           │
        │ Admin APPROVES            │ Admin REJECTS
        ▼                           ▼
┌──────────────┐            ┌──────────────┐
│   CLOSED     │            │   ACTIVE     │
│              │            │              │
│ LOCKED       │            │ UNLOCKED     │
│ Permanent    │            │ Can work     │
│ Read-only    │            │ again        │
└──────────────┘            └──────────────┘
```

---

## Status Field Structure

```
┌──────────────────────────────────────────────────────────────────────────┐
│                    project_status_info OBJECT                             │
└──────────────────────────────────────────────────────────────────────────┘

{
  ┌─────────────────────────────────────────────┐
  │  "raw": "PENDING_FINAL_APPROVAL"            │ ← Database value
  ├─────────────────────────────────────────────┤
  │  "display": "PENDING_CLOSURE"               │ ← Show this in UI
  ├─────────────────────────────────────────────┤
  │  "is_closed": false                         │ ◄─┐
  │  "is_pending_closure": true                 │   │ Boolean
  │  "is_locked": true                          │   │ state flags
  ├─────────────────────────────────────────────┤   │
  │  "can_create_tasks": false                  │ ◄─┤
  │  "can_edit_project": false                  │   │ Permission
  │  "can_request_closure": false               │   │ flags
  └─────────────────────────────────────────────┘ ◄─┘
}
```

---

## Decision Tree: Which Status Field to Use?

```
                     Need to show status in UI?
                              │
                    ┌─────────┴─────────┐
                    YES                 NO
                    │                   │
                    ▼                   ▼
        Use project_status_info    Need to check
               .display            permissions?
                                        │
                    ┌───────────────────┴───────────────┐
                    YES                                 NO
                    │                                   │
                    ▼                                   ▼
        Use project_status_info              Use project_status_info
        .can_create_tasks                           .is_*
        .can_edit_project                      (is_closed, is_locked,
        .can_request_closure                   is_pending_closure)
```

---

## Role-Based Access Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│                      WHO CAN DO WHAT?                                     │
└──────────────────────────────────────────────────────────────────────────┘

EMPLOYEE
   │
   ├─ Create Task ────────────────────────────► NO
   ├─ Submit Task for Review ─────────────────► YES (own tasks)
   ├─ Approve Task ───────────────────────────► NO
   ├─ Request Project Closure ────────────────► NO
   └─ Approve Project Closure ────────────────► NO

MANAGER
   │
   ├─ Create Task ────────────────────────────► YES (if project active)
   ├─ Submit Task for Review ─────────────────► YES
   ├─ Approve Task ───────────────────────────► YES
   ├─ Request Project Closure ────────────────► YES (if all tasks done)
   └─ Approve Project Closure ────────────────► NO

ADMIN
   │
   ├─ Create Task ────────────────────────────► YES (if project active)
   ├─ Submit Task for Review ─────────────────► YES
   ├─ Approve Task ───────────────────────────► YES
   ├─ Request Project Closure ────────────────► YES
   └─ Approve Project Closure ────────────────► YES
```

---

## Complete Workflow Sequence

```
┌──────────────────────────────────────────────────────────────────────────┐
│                   COMPLETE END-TO-END FLOW                                │
└──────────────────────────────────────────────────────────────────────────┘

 DAY 1                        DAY 2                        DAY 3
   │                            │                            │
   │ Manager creates            │                            │
   │ tasks (207, 208)           │                            │
   │                            │                            │
   │ Assigns to employees       │                            │
   ▼                            │                            │
┌─────────┐                    │                            │
│ TODO    │                    │                            │
└─────────┘                    │                            │
   │                            │                            │
   │ Employees start work       │                            │
   ▼                            │                            │
┌─────────────┐                │                            │
│ IN_PROGRESS │                │                            │
└─────────────┘                │                            │
   │                            │                            │
   │ Employee completes         │                            │
   │ and submits (207)          │                            │
   ▼                            ▼                            │
┌──────────┐             ┌──────────┐                      │
│  REVIEW  │ ──Request──►│ MANAGER  │                      │
│ (Task 207)│  #22       │ Reviews  │                      │
└──────────┘             └────┬─────┘                      │
   │                          │                             │
   │                          │ Approves                    │
   ▼                          ▼                             │
┌───────────┐          ┌───────────┐                       │
│ COMPLETED │          │ COMPLETED │                       │
│ (Task 207)│          │ (Task 207)│                       │
└───────────┘          └───────────┘                       │
   │                          │                             │
   │ Employee submits         │                             │
   │ second task (208)        │                             │
   ▼                          ▼                             │
┌──────────┐             ┌──────────┐                      │
│  REVIEW  │ ──Request──►│ MANAGER  │                      │
│ (Task 208)│  #23       │ Reviews  │                      │
└──────────┘             └────┬─────┘                      │
                              │                             │
                              │ Approves                    │
                              ▼                             ▼
                        ┌───────────┐               ┌──────────────┐
                        │ COMPLETED │               │ ALL TASKS    │
                        │ (Task 208)│               │ COMPLETED!   │
                        └─────┬─────┘               └──────┬───────┘
                              │                             │
                              │ System detects              │
                              │ all tasks done              │
                              ▼                             │
                        ┌─────────────────┐                │
                        │ MANAGER         │                │
                        │ Requests        │                │
                        │ Project Closure │                │
                        └────────┬────────┘                │
                                 │                          │
                    Request #24  │                          │
                                 ▼                          │
                        ┌─────────────────┐                │
                        │ PROJECT STATUS  │                │
                        │ Changes:        │                │
                        │ ACTIVE →        │                │
                        │ PENDING_FINAL_  │                │
                        │ APPROVAL        │                │
                        │                 │                │
                        │ Display:        │                │
                        │ "PENDING_       │                │
                        │  CLOSURE"       │                │
                        │                 │                │
                        │ Project LOCKED  │                │
                        │ Tasks LOCKED    │                │
                        └────────┬────────┘                │
                                 │                          │
                                 │                          │
                                 ▼                          ▼
                            ┌─────────┐              ┌──────────┐
                            │  ADMIN  │              │  ADMIN   │
                            │ Reviews │              │ Approves │
                            └────┬────┘              └────┬─────┘
                                 │                        │
                                 │                        │
                                 ▼                        ▼
                        ┌─────────────────┐      ┌──────────────┐
                        │ PROJECT STATUS  │      │   PROJECT    │
                        │ Changes:        │      │   CLOSED     │
                        │ PENDING_FINAL_  │      │              │
                        │ APPROVAL →      │      │ Permanently  │
                        │ CLOSED          │      │ Archived     │
                        │                 │      │              │
                        │ Display:        │      │ All data     │
                        │ "CLOSED"        │      │ preserved    │
                        │                 │      │ Read-only    │
                        │ LOCKED (perm)   │      │              │
                        └─────────────────┘      └──────────────┘
```

---

## State Transition Matrix

```
┌──────────────────────────────────────────────────────────────────────────┐
│                     VALID STATE TRANSITIONS                               │
└──────────────────────────────────────────────────────────────────────────┘

TASK STATES
┌────────────────┬──────────────────────────────────────────────────────┐
│  FROM          │  CAN TRANSITION TO                                   │
├────────────────┼──────────────────────────────────────────────────────┤
│  TODO          │  IN_PROGRESS, ON_HOLD                                │
│  IN_PROGRESS   │  REVIEW, ON_HOLD, TODO                               │
│  REVIEW        │  COMPLETED (approved), IN_PROGRESS (rejected)        │
│  COMPLETED     │  (final state)                                       │
│  ON_HOLD       │  TODO, IN_PROGRESS                                   │
└────────────────┴──────────────────────────────────────────────────────┘

PROJECT STATES
┌──────────────────────────┬───────────────────────────────────────────┐
│  FROM                    │  CAN TRANSITION TO                        │
├──────────────────────────┼───────────────────────────────────────────┤
│  ACTIVE                  │  PENDING_FINAL_APPROVAL                   │
│  PENDING_FINAL_APPROVAL  │  CLOSED (approved), ACTIVE (rejected)     │
│  CLOSED                  │  (final state - permanent)                │
└──────────────────────────┴───────────────────────────────────────────┘
```

---

## UI Component Hierarchy

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         UI STRUCTURE                                      │
└──────────────────────────────────────────────────────────────────────────┘

ProjectList
  │
  ├─► ProjectCard (for each project)
  │     │
  │     ├─► StatusBadge
  │     │     └─► Uses: project_status_info.display
  │     │
  │     ├─► ProjectActions
  │     │     ├─► CreateTaskButton
  │     │     │     └─► Visible if: can_create_tasks
  │     │     │
  │     │     ├─► EditProjectButton
  │     │     │     └─► Visible if: can_edit_project
  │     │     │
  │     │     └─► RequestClosureButton
  │     │           └─► Visible if: can_request_closure
  │     │
  │     ├─► StatusAlert (conditional)
  │     │     ├─► If is_pending_closure: "Awaiting approval"
  │     │     ├─► If is_closed: "Permanently closed"
  │     │     └─► If is_locked: "Project locked"
  │     │
  │     └─► TaskList
  │           └─► TaskCard (for each task)
  │                 ├─► TaskStatusBadge
  │                 └─► TaskActions
  │
  └─► WorkflowRequestList (for managers/admins)
        └─► WorkflowRequestCard (for each request)
              ├─► ApproveButton
              └─► RejectButton
```

---

## Error Handling Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│                       ERROR SCENARIOS                                     │
└──────────────────────────────────────────────────────────────────────────┘

User tries to create task
        │
        ▼
  Check project_status_info
        │
        ├─► is_closed = true ────────► Show: "Project is closed"
        │                               Action: Disable button
        │
        ├─► is_pending_closure = true ► Show: "Awaiting admin approval"
        │                               Action: Disable button
        │
        └─► can_create_tasks = false ─► Show: "Cannot create tasks"
                                        Action: Hide button

User tries to edit project
        │
        ▼
  Check project_status_info
        │
        ├─► is_locked = true ──────────► Show: "Project is locked"
        │                               Action: Disable all inputs
        │
        └─► can_edit_project = false ──► Show: "No edit permission"
                                        Action: Hide edit button
```

---

**For more details, see:**
- [WORKFLOW_QUICK_REFERENCE.md](../docs/WORKFLOW_QUICK_REFERENCE.md)
- [WORKFLOW_STATUS_GUIDE.md](../docs/WORKFLOW_STATUS_GUIDE.md)
