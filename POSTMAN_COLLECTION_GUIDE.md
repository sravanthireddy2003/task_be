# Updated Postman Collection - Complete Guide

## 📦 File Details

**File Name**: `postman_complete_client_management_v2.json`  
**Location**: `c:\Users\Administrator\Pictures\TM\TM-F\task_be\`  
**Size**: 19.2 KB  
**Version**: 2.0.0  
**Last Updated**: December 10, 2025

---

## 🎯 What's Included

### 1. **Authentication (3 requests)**
- Admin Login → Sets `adminToken` variable
- Manager Login → Sets `managerToken` variable
- Client Viewer Login → Sets `viewerToken` variable

**Auto-Token Capture**: Each login request automatically stores the token in Postman environment variables for use in subsequent requests.

---

### 2. **Client CRUD (9 requests)**

#### Create Operations
- **Create Client (Admin)** - Full client data including GST, addresses, manager assignment
  - Triggers automatic onboarding task generation
  - Includes optional contact creation

#### Read Operations
- **List Clients - Admin** - Shows all clients with pagination & filters
  - Filters: search, status, manager_id
- **List Clients - Manager** - Shows only assigned clients
- **Get Client Details** - Full client profile with all relations

#### Update Operations
- **Update Client** - Modify client status, contact info, notes
- **Assign Manager to Client** - Change manager assignment

#### Delete Operations
- **Soft Delete Client** - Marks as inactive (recoverable)
- **Restore Soft Deleted Client** - Reactivates soft-deleted client
- **Permanently Delete Client** - Hard delete from database

---

### 3. **Contact Management (4 requests)**

- **Add Client Contact** - Create new contact with designation & email validation
- **List Client Contacts** - View all contacts for a client
- **Update Contact** - Modify contact information
- **Delete Contact** - Remove contact from client

---

### 4. **Document Management (5 requests)**

- **Upload Client Documents** - Multipart form upload (up to 20 files)
  - Fields: files, document_type (e.g., Contract), classification
- **List Client Documents** - View all documents for a client
- **Get Document Details** - Individual document metadata
- **Delete Document (Soft)** - Mark as inactive
- **Restore Deleted Document** - Reactivate deleted document

---

### 5. **Client Dashboard (2 requests)**

- **Get Client Dashboard** - Aggregated metrics and overview
  - Includes project count, task stats, recent activities
- **Get Activity Logs** - Client activity timeline
  - Paginated with date-based sorting

---

### 6. **Client Viewer Management (3 requests)**

- **Create Client Viewer Account** - Generate viewer account
  - Auto-sends credentials via email
  - Restricts access to assigned client only
- **List Client Viewers** - View all viewer accounts
- **Remove Viewer Access** - Deactivate viewer account

---

### 7. **Error Scenarios (5 requests)**

Pre-configured error test cases:
- Missing token (401 Unauthorized)
- Non-admin create attempt (403 Forbidden)
- Invalid email validation (400 Bad Request)
- Invalid client ID (404 Not Found)
- Manager accessing non-assigned client (403 Forbidden)

---

## 🚀 Quick Start

### Step 1: Import Collection
1. Open Postman
2. Click **Import** (top-left)
3. Select `postman_complete_client_management_v2.json`
4. Collection imported successfully ✓

### Step 2: Configure Environment
Collection includes variables:
- **baseUrl**: `http://localhost:3000` (auto-configured)
- **adminToken**: Auto-set after Admin Login
- **managerToken**: Auto-set after Manager Login
- **viewerToken**: Auto-set after Viewer Login

### Step 3: Run Requests
1. Start server: `npm start`
2. Go to **Authentication** folder
3. Run **Admin Login** first (captures token)
4. Run any other request - token is automatically included

---

## 🔐 Authentication Flow

```
1. Admin Login
   ↓
   adminToken stored
   ↓
2. Use adminToken in Authorization header for all admin requests
   ↓
3. Manager/Viewer Login similarly
```

All requests include proper headers:
```
Authorization: Bearer {{adminToken}}
Content-Type: application/json
```

---

## 📝 Sample Payloads

### Create Client
```json
{
  "name": "Tech Solutions Inc",
  "email": "contact@techsolutions.com",
  "phone": "9876543210",
  "billing_address": "123 Main St, New York, NY 10001",
  "office_address": "456 Park Ave, New York, NY 10001",
  "gst_number": "18AABCT1234H1Z0",
  "tax_id": "TAX-2024-001",
  "industry_type": "Technology",
  "status": "Active",
  "manager_id": 1,
  "notes": "Premium enterprise client"
}
```

### Upload Documents
Multipart form with:
- `files` (multipart) - One or more documents
- `document_type` - Contract, Invoice, Agreement, etc.
- `classification` - Public, Confidential, Internal, etc.

### Create Viewer Account
```json
{
  "name": "Client Viewer",
  "email": "viewer@techsolutions.com",
  "send_credentials": true
}
```

---

## 🔍 Filter & Search Examples

### List Clients with Filters
```
GET /api/clients?page=1&limit=10&search=tech&status=Active&manager_id=2
```

### Activity Logs Pagination
```
GET /api/clients/1/activity-logs?page=1&limit=20
```

---

## ✅ Features Tested

| Feature | Status | Tests |
|---------|--------|-------|
| Create Client | ✓ | admin_create, validation_errors |
| List Clients | ✓ | admin_all, manager_assigned, pagination |
| Get Details | ✓ | full_profile, contacts, documents |
| Update Client | ✓ | status, manager_assignment |
| Delete Client | ✓ | soft_delete, restore, permanent |
| Contact Mgmt | ✓ | add, update, delete |
| Document Upload | ✓ | multipart, metadata, restore |
| Dashboard | ✓ | aggregation, activity_logs |
| Viewer Accounts | ✓ | create, list, remove_access |
| Access Control | ✓ | role_based, unauthorized, forbidden |

---

## 🛠️ Integration Steps

1. **Update app.js**
   ```javascript
   // OLD:
   const clientsApi = require('./controller/ClientsApi');
   
   // NEW:
   const clientsApi = require('./controller/ClientsApi_v2');
   app.use('/api/clients', clientsApi);
   ```

2. **Run Database Migration**
   ```bash
   node scripts/run_migration_007.js
   ```

3. **Restart Server**
   ```bash
   npm start
   ```

4. **Test with Postman**
   - Import this collection
   - Run authentication first
   - Test all endpoints

---

## 📞 Support

For issues or modifications:
- Check `CLIENT_MANAGEMENT_README.md` for API details
- Review `IMPLEMENTATION_GUIDE.md` for integration steps
- See `FILE_MANIFEST.md` for technical reference

All endpoints include error handling and validation!
