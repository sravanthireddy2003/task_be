# New Workflow Module Integration Notes

## Setup Steps

1. **Run Database Migration:**
   - Execute `node scripts/migrate_workflow.js` to create tables.

2. **Seed Default Workflows:**
   - Run `node scripts/seed_workflow_definitions.js` to add TASK and PROJECT workflows.

3. **Ensure Entity Tables:**
   - `tasks` and `projects` tables must have a `status` VARCHAR(50) column.

4. **Routes Included:**
   - Already mounted in `src/app.js` via `app.use('/api', workflowRoutes);`.

5. **Notifications:**
   - Integrates with existing `NotificationService` for approval notifications.

## Task Completion Integration
- The `/api/tasks/:id/complete` endpoint now uses workflow for state transitions
- Supports both direct completion and approval-required completion
- Handles task recurrence automatically
- Resolves task IDs from public_id strings

## API Flow Example

1. **Login** → Get JWT token
2. **Request Transition** → EMPLOYEE moves task to "In Progress" (direct)
3. **Request Transition** → EMPLOYEE moves task to "Review" (creates approval request)
4. **Get Pending** → MANAGER sees approval request
5. **Approve Request** → MANAGER approves, state changes to "Completed"
6. **Get History** → View full audit trail

## Security

- Tenant isolation enforced
- Role-based permissions checked
- All actions logged for audit

## Customization

- Modify state machines in `workflowEngine.js`
- Add custom rules in `workflowRulesAdapter.js`
- Extend notifications in `workflowService.js`