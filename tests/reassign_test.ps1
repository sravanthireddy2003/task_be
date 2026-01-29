<#
PowerShell quick test for approve+reassign flow (adjust URLs, tokens, ids)

Usage:
  1) Generate manager token in your environment and set $managerToken
  2) Generate employee tokens for old/new assignees and set $oldToken/$newToken
  3) Run this script from PowerShell on Windows
#>

$base = 'http://localhost:4000'

# Replace these placeholders with real tokens/ids
$managerToken = '<MANAGER_JWT>'
$oldUserId = '<OLD_USER_PUBLIC_OR_INTERNAL_ID>'
$taskId = '<TASK_INTERNAL_ID_OR_PUBLIC>'
$newAssigneeIdentifier = '<NEW_ASSIGNEE_PUBLIC_ID_OR_EMAIL_OR_INTERNAL>'

Write-Host "Approving resign request for task $taskId (requester $oldUserId) -> new: $newAssigneeIdentifier"

$body = @{ approve = $true; newAssigneeId = $newAssigneeIdentifier } | ConvertTo-Json

$approveUrl = "$base/api/projects/tasks/$taskId/reassign/$oldUserId"

$r = curl.exe -s -X PATCH -H "Content-Type: application/json" -H "Authorization: Bearer $managerToken" -d $body $approveUrl | Out-String
Write-Host "Approve response:`n$r"

Write-Host "\nNow query employee views for old and new assignees (to verify visibility)"

# old assignee
$oldToken = '<OLD_ASSIGNEE_JWT>'
$newToken = '<NEW_ASSIGNEE_JWT>'

$oldResp = curl.exe -s -H "Authorization: Bearer $oldToken" "$base/api/employee/my-tasks" | Out-String
Write-Host "Old assignee my-tasks:`n$oldResp"

$newResp = curl.exe -s -H "Authorization: Bearer $newToken" "$base/api/employee/my-tasks" | Out-String
Write-Host "New assignee my-tasks:`n$newResp"
