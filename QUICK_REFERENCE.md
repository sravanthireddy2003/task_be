# Client Management Module - Quick Reference Card

## 🚀 5-Minute Setup

```bash
# 1. Run migration
node scripts/run_migration_007.js

# 2. Update app.js (around line where ClientsApi is imported)
# OLD: const clientsApi = require('./controller/ClientsApi');
# NEW: const clientsApi = require('./controller/ClientsApi_v2');

# 3. Restart server
npm start
```

## 📁 File Map

| File | What It Does | Size |
|------|-------------|------|
| `ClientsApi_v2.js` | Main API with CRUD, dashboard, docs, contacts | 850 lines |
| `ClientValidationService.js` | Validates inputs, prevents mass assignment | 200 lines |
| `ClientOnboardingService.js` | Auto-generates 4 tasks on client creation | 100 lines |
| `managerAccess.js` | Restricts managers to assigned clients | 50 lines |
| `007_expand_clients_schema.sql` | Database migration (14 new columns, 1 new table) | 100 lines |
| `CLIENT_MANAGEMENT_README.md` | Complete documentation | 600 lines |
| `IMPLEMENTATION_GUIDE.md` | How components work & how to integrate | 500 lines |
| `postman_complete_client_management.json` | Ready-to-test API collection | 30+ calls |
| `swagger_client_management_api.json` | OpenAPI 3.0 specification | Full docs |

## 🔌 API Endpoints (Quick List)

### Clients (8 endpoints)
- `GET /api/clients` - List with pagination
- `POST /api/clients` - Create (Admin only)
- `GET /api/clients/:id` - Get details
- `PUT /api/clients/:id` - Update
- `DELETE /api/clients/:id` - Soft delete (Admin only)
- `POST /api/clients/:id/restore` - Restore (Admin only)
- `DELETE /api/clients/:id/permanent` - Hard delete (Admin only)
- `POST /api/clients/:id/assign-manager` - Assign manager (Admin only)

### Contacts (3 endpoints)
- `POST /api/clients/:id/contacts` - Add
- `PUT /api/clients/:id/contacts/:cid` - Update
- `DELETE /api/clients/:id/contacts/:cid` - Delete

### Documents (3 endpoints)
- `POST /api/clients/:id/upload` - Upload files (multipart)
- `POST /api/clients/:id/documents` - Add via JSON URLs
- `DELETE /api/clients/:id/documents/:docId` - Delete

### Dashboard (1 endpoint)
- `GET /api/clients/:id/dashboard` - Metrics & analytics

### Viewers (1 endpoint)
- `POST /api/clients/:id/create-viewer` - Create viewer account

## 👥 Role-Based Access

| Operation | Admin | Manager | Viewer | Employee |
|-----------|-------|---------|--------|----------|
| Create | ✓ | ✗ | ✗ | ✗ |
| List All | ✓ | ✗ | ✗ | ✗ |
| List Assigned | N/A | ✓ | ✗ | ✗ |
| Get Details | ✓ | ✓* | ✓* | ✗ |
| Update | ✓ | ✓* | ✗ | ✗ |
| Delete | ✓ | ✗ | ✗ | ✗ |
| Upload Docs | ✓ | ✓* | ✗ | ✗ |
| Dashboard | ✓ | ✓* | ✓* | ✗ |
| Create Viewer | ✓ | ✗ | ✗ | ✗ |

*Only for assigned/mapped client

## 📋 Create Client Example

```bash
curl -X POST http://localhost:3000/api/clients \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Tech Solutions Ltd",
    "company": "Tech Solutions",
    "billingAddress": "123 Business St, NY",
    "officeAddress": "456 Office Ave, NY",
    "gstNumber": "07AABCT1234H1Z0",
    "taxId": "TAX-123456",
    "industry": "Information Technology",
    "notes": "Premium account",
    "status": "Active",
    "managerId": 2,
    "email": "contact@techsolutions.com",
    "phone": "+1-212-555-0123",
    "createViewer": true,
    "contacts": [{
      "name": "John Doe",
      "email": "john@techsolutions.com",
      "designation": "CEO",
      "is_primary": true
    }]
  }'
```

## 📊 Response Examples

### Success
```json
{
  "success": true,
  "message": "Client created successfully",
  "data": { "id": 1, "ref": "TS0001", "name": "Tech Solutions", "status": "Active" },
  "onboardingTasks": [...]
}
```

### Validation Error
```json
{
  "success": false,
  "error": "Validation failed",
  "details": {
    "gstNumber": ["Invalid GST format"],
    "email": ["Invalid email format"]
  }
}
```

### Access Denied
```json
{
  "success": false,
  "error": "Access denied: Not assigned to this client"
}
```

## 🔒 Security Features

✅ JWT authentication (all routes)  
✅ Role-based access control (Admin/Manager/Viewer)  
✅ Manager scoped to assigned clients  
✅ Viewer scoped to mapped client  
✅ Email/phone/GST validation  
✅ Mass assignment prevention  
✅ Multi-tenant isolation  
✅ Soft deletes (data preservation)  
✅ Activity logging & audit trail  
✅ SQL injection prevention  

## 📝 Validation Rules

| Field | Rules |
|-------|-------|
| name | Required, non-empty string |
| company | Required, non-empty string |
| gstNumber | Optional, must be 15 alphanumeric (Indian GST) |
| email | Optional, must be valid email format |
| phone | Optional, must be 10+ digits (allows spaces/-/+) |
| status | Must be one of: Active, Inactive, On Hold, Closed |
| contact.name | Required, non-empty string |
| contact.email | Optional, valid email if provided |
| contact.phone | Optional, valid phone if provided |

## 🗄️ Database Schema Summary

### New Tables
- `onboarding_tasks` - Tracks auto-generated tasks

### Modified Tables
- `clientss` - +14 columns (addresses, IDs, industry, timestamps, tenant)
- `client_contacts` - +3 columns (validation flags, updated_at)
- `client_documents` - +2 columns (document_type, is_deleted)
- `client_activity_logs` - +3 columns (action_type, ip, changes JSON)
- `client_viewers` - +1 column (is_active)

### Indexes Added (10+)
- status, manager_id, tenant_id, gst_number, email, phone, document_type, action_type, created_at

## 🚦 Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success (GET, PUT, DELETE) |
| 201 | Created (POST) |
| 400 | Validation error or bad request |
| 401 | Unauthorized (missing/invalid token) |
| 403 | Forbidden (insufficient permissions) |
| 404 | Not found |
| 500 | Server error |

## 💡 Common Tasks

### List clients assigned to manager
```bash
GET /api/clients (as manager)
# Returns: only clients where manager_id = logged-in user
```

### Search clients
```bash
GET /api/clients?search=tech
# Searches: name, company, gst_number
```

### Filter by status
```bash
GET /api/clients?status=Active
```

### Paginate results
```bash
GET /api/clients?page=2&limit=50
```

### Upload document
```bash
POST /api/clients/1/upload
Content-Type: multipart/form-data
files: [document1.pdf, document2.docx]
```

### Get dashboard metrics
```bash
GET /api/clients/1/dashboard
Returns: { totalProjects, totalTasks, completedTasks, pendingTasks, recentActivities, recentDocuments }
```

### Create viewer account
```bash
POST /api/clients/1/create-viewer
{ "email": "viewer@company.com", "name": "John Viewer" }
Returns: { publicId, userId, email }
# Email sent automatically with login credentials
```

## 🛠️ Troubleshooting Quick Fixes

| Problem | Solution |
|---------|----------|
| Migration fails | `GRANT ALTER on db.* to 'user'@'localhost';` |
| 403 on client GET | Check manager_id = your user_id in DB |
| Email not sent | Check SMTP settings in .env |
| Viewer can't login | Check client_viewers table has mapping |
| Validation error | Check details field for field-level errors |
| Mass assignment issue | Update endpoint only allows whitelisted fields |

## 📚 Documentation

- **Full README**: `CLIENT_MANAGEMENT_README.md` (600 lines)
- **Setup Guide**: `IMPLEMENTATION_GUIDE.md` (500 lines)
- **API Spec**: `swagger_client_management_api.json` (OpenAPI 3.0)
- **Test Requests**: `postman_complete_client_management.json` (30+ calls)

## 🔍 Testing with Postman

1. Open Postman
2. Import `postman_complete_client_management.json`
3. Set variables:
   - `baseUrl` = `http://localhost:3000`
   - `adminToken` = Your admin JWT token
   - `managerToken` = Your manager JWT token
   - `viewerToken` = Your viewer JWT token
4. Run requests in order

## ✅ Pre-Deployment Checklist

- [ ] Migration 007 applied: `node scripts/run_migration_007.js`
- [ ] app.js updated to use ClientsApi_v2.js
- [ ] .env has SMTP_HOST, SMTP_USER, SMTP_PASS
- [ ] JWT_SECRET set and strong
- [ ] Database backups configured
- [ ] Tested with Postman collection
- [ ] Admin can create clients ✓
- [ ] Manager sees only assigned clients ✓
- [ ] Viewer access restricted to mapped client ✓
- [ ] Email sending works (test create-viewer)
- [ ] Upload endpoint works (test POST /clients/:id/upload)

## 🎯 Success Indicators

✅ Can create client as admin  
✅ Manager lists only assigned clients  
✅ Viewer gets 403 on non-mapped client  
✅ Validation errors show field details  
✅ Email credentials sent when creating viewer  
✅ Documents upload to /uploads  
✅ Dashboard returns metrics  
✅ Activity logs track all operations  
✅ Soft deletes work (isDeleted flag)  
✅ Restore brings back soft-deleted clients  

---

**Quick Start**: 5 minutes  
**Full Integration**: 30 minutes  
**Testing**: 1 hour  
**Deployment**: Follow checklist in README

**Status**: ✅ Production Ready
