# Smoke test for local API endpoints (PowerShell)
# Requires server running on http://localhost:4000

$base = "http://localhost:4000/api"

Write-Output '1) Create task (POST /projects/tasks)'
$createPayload = @{
  title = 'Smoke Test Task'
  description = 'Created by smoke_test'
  assigned_to = @(1)
  taskDate = (Get-Date).ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
  client_id = 1
} | ConvertTo-Json -Depth 5

Write-Output $createPayload

try {
  Invoke-RestMethod -Uri "$base/projects/tasks" -Method Post -Body $createPayload -ContentType 'application/json' -ErrorAction Stop | ConvertTo-Json | Write-Output
} catch {
  Write-Error "Request failed: $($_.Exception.Message)"
}

Write-Output ''
Write-Output '2) Update task (PUT /tasks/:id) — replace :id with created task id'
Write-Output 'Example:'
Write-Output 'curl -X PUT http://localhost:4000/api/tasks/123 -H "Content-Type: application/json" -d "{""title"":""Updated Smoke Task""}"'

Write-Output ''
Write-Output '3) Create subtask (POST /createsub/:task_id) — replace :task_id with internal ID'
Write-Output 'Example:'
Write-Output 'curl -X POST http://localhost:4000/api/tasks/createsub/123 -H "Content-Type: application/json" -d "{""title"":""Smoke Subtask"",""due_date"":""2026-02-07"",""tag"":""smoke""}"'

Write-Output ''
Write-Output 'Notes:'
Write-Output '- Ensure the server is running and .env has DB credentials.'
Write-Output '- If endpoints require auth, include the Authorization header with a valid Bearer token.'
