# 🚀 Postman Collection v2.0 - Quick Import Guide

## Download & Import

### Option 1: Direct Import
1. Download: `postman_complete_client_management_v2.json`
2. Open Postman → Click **Import**
3. Select the downloaded file
4. Click **Import**

### Option 2: Copy Raw File
1. Open the collection file in editor
2. Copy all content
3. Postman → **Import** → **Paste Raw Text** tab
4. Paste and import

---

## File Information

| Property | Value |
|----------|-------|
| **Filename** | `postman_complete_client_management_v2.json` |
| **Version** | 2.0.0 |
| **Total Requests** | 30+ |
| **Test Coverage** | 7 major feature areas |
| **File Size** | 19.2 KB |
| **Format** | Postman Collection v2.1 |

---

## What's Included in v2.0

✅ **7 Folders with 30+ API Requests**:
- Authentication (3 requests with auto token capture)
- Client CRUD (9 requests)
- Contact Management (4 requests)
- Document Management (5 requests)
- Client Dashboard (2 requests)
- Client Viewer Management (3 requests)
- Error Scenarios (5 requests for testing)

✅ **Pre-configured Variables**:
- `baseUrl` → http://localhost:3000
- `adminToken` → Auto-captured after login
- `managerToken` → Auto-captured after login
- `viewerToken` → Auto-captured after login

✅ **Complete Request Details**:
- All headers configured
- Sample payloads included
- Query parameters documented
- Error cases included

---

## Setup Checklist

- [ ] Server running on port 3000
- [ ] Database migration executed: `node scripts/run_migration_007.js`
- [ ] app.js updated to use ClientsApi_v2
- [ ] Collection imported into Postman
- [ ] Run "Admin Login" request first
- [ ] Verify token is captured in variables
- [ ] Test "List Clients" request

---

## First Request to Run

```
1. Go to → Authentication → Admin Login
2. Click Send
3. Check response for token
4. Verify {{adminToken}} is auto-populated
5. Run any other request with Auth header
```

**Expected Response from Login**:
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": { ... }
  }
}
```

---

## Folder Organization

```
📁 Complete Client Management API v2.0
├── 📂 Authentication
│   ├── Admin Login ⭐ (Run this first)
│   ├── Manager Login
│   └── Client Viewer Login
│
├── 📂 Client CRUD
│   ├── Create Client
│   ├── List Clients - Admin
│   ├── List Clients - Manager
│   ├── Get Client Details
│   ├── Update Client
│   ├── Assign Manager
│   ├── Soft Delete
│   ├── Restore
│   └── Permanent Delete
│
├── 📂 Contact Management
│   ├── Add Contact
│   ├── List Contacts
│   ├── Update Contact
│   └── Delete Contact
│
├── 📂 Document Management
│   ├── Upload Documents
│   ├── List Documents
│   ├── Get Document Details
│   ├── Delete Document
│   └── Restore Document
│
├── 📂 Client Dashboard
│   ├── Get Dashboard
│   └── Get Activity Logs
│
├── 📂 Client Viewer Management
│   ├── Create Viewer Account
│   ├── List Viewers
│   └── Remove Viewer Access
│
└── 📂 Error Scenarios
    ├── Missing Token (401)
    ├── Non-Admin Create (403)
    ├── Invalid Email (400)
    ├── Invalid Client ID (404)
    └── Manager Access Denied (403)
```

---

## Usage Tips

### Tip 1: Auto Token Capture
After login, tokens are automatically stored in collection variables. No manual copy-paste needed!

### Tip 2: Base URL
Change `{{baseUrl}}` variable if running on different port:
- Local: `http://localhost:3000`
- Remote: `http://your-domain.com`

### Tip 3: Dynamic IDs
Replace `1`, `2`, `99999` with actual IDs from previous responses.

### Tip 4: Test Role-Based Access
- Admin requests: Use `{{adminToken}}`
- Manager requests: Use `{{managerToken}}`
- Viewer requests: Use `{{viewerToken}}`

### Tip 5: File Upload
For document upload:
1. Click the `files` field
2. Click "Select Files"
3. Choose documents to upload
4. Set `document_type` and `classification`

---

## Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| "Unauthorized" (401) | Run Admin Login first, check {{adminToken}} is populated |
| "Forbidden" (403) | Ensure using correct role token (admin/manager/viewer) |
| "Client not found" (404) | Check client ID exists, use List Clients to find valid IDs |
| "Invalid email" (400) | Use valid email format in payload |
| "Manager access denied" (403) | Manager can only access assigned clients |

---

## Next Steps

1. ✅ Import collection into Postman
2. ✅ Configure base URL (already set to localhost:3000)
3. ✅ Run authentication requests
4. ✅ Test Client CRUD endpoints
5. ✅ Test other feature areas
6. ✅ Review response formats in `CLIENT_MANAGEMENT_README.md`

---

## Additional Resources

- **Complete API Docs**: `CLIENT_MANAGEMENT_README.md`
- **Implementation Guide**: `IMPLEMENTATION_GUIDE.md`
- **File Reference**: `FILE_MANIFEST.md`
- **Quick Reference**: `QUICK_REFERENCE.md`
- **OpenAPI Spec**: `swagger_client_management_api.json`

Happy testing! 🎉
