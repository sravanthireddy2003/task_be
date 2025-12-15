# Complete Client Management Backend Module

Production-ready, multi-tenant, role-secured Client Management API with comprehensive CRUD operations, dashboard, document management, client-viewer accounts, and activity logging.

## Features

### Core Client Management
- **Full CRUD Operations**: Create, read, update, soft-delete, restore, and permanently delete clients
- **Client Profiles**: Store comprehensive client data including:
  - Billing & office addresses
  - GST/Tax ID numbers
  - Bank account details
  - Industry type classification
  - Status management (Active/Inactive/On Hold/Closed)
  - Notes and timestamps
  - Audit trail (created_by, updated_by)

### Contact Management
- Add multiple contacts per client
- Update contact information
- Set primary contact
- Email and phone validation
- Contact deletion with audit logging

### Document Management
- **File Upload**: Multipart form upload (up to 20 files per request)
- **Document Metadata**: Store URLs, MIME types, document classification
- **Soft Delete**: Mark documents as inactive instead of permanent deletion
- **Access Control**: Admin/Manager only document management
- **Organization**: Documents linked to client with history

### Client Dashboard
- Aggregated project & task metrics
- Task completion tracking
- Recent activities timeline
- Recent documents list
- Upcoming deadline indicators

### Manager Assignment & Access Control
- Assign managers to clients
- Manager-scoped access (managers see only assigned clients)
- Role-based filtering (Admin sees all, Manager sees assigned, Viewer sees mapped client)
- Multi-tenant isolation (tenant_id filtering)
- Admin override capabilities

### Client-Viewer Account System
- Auto-create viewer accounts from client contacts
- Role-based read-only access
- Auto-generated credentials sent via email
- Viewer mapped to specific client (cannot access other clients)
- Account deactivation support

### Activity Logging
- Audit trail for all operations (create, update, delete)
- Actor tracking (who made the change)
- Detailed change history (JSON-stored changes)
- Timestamp tracking
- Action type classification

### Security Features
- **JWT Authentication**: Token-based access
- **Role-Based Access Control (RBAC)**:
  - Admin: Full access to all clients and operations
  - Manager: Scoped to assigned clients only
  - Client-Viewer: Read-only access to mapped client
  - Employee: Department-scoped (if applicable)
- **Data Validation**:
  - Email format validation
  - Phone number format validation
  - GST/Tax ID format validation
  - DTO validation with field-level error reporting
- **Mass Assignment Prevention**: Whitelist allowed fields on updates
- **Tenant Isolation**: Data scoped by tenant_id
- **IP Logging**: Optional IP address tracking in activity logs

## Architecture

### Directory Structure
```
task_be/
├── controller/
│   ├── ClientsApi.js              # Main clients API controller (DEPRECATED - use ClientsApi_v2.js)
│   └── ClientsApi_v2.js           # Enhanced controller with all features
├── services/
│   ├── ClientOnboardingService.js # Auto-generates onboarding tasks
│   ├── ClientValidationService.js # DTO & field validators
├── middleware/
│   ├── managerAccess.js           # Restricts manager to assigned clients
│   ├── clientViewer.js            # Scopes viewer to mapped client
│   ├── auth.js                    # JWT authentication
│   ├── role.js                    # Role-based access control
│   └── tenant.js                  # Multi-tenant isolation
├── database/
│   └── migrations/
│       ├── 006_create_client_viewers.sql
│       └── 007_expand_clients_schema.sql
├── routes/
│   └── (embedded in controller/ClientsApi_v2.js)
└── logs/
    └── (activity logs directory)
```

### Database Schema

#### clientss
- `id` (INT, PK) - Client ID
- `ref` (VARCHAR, UNIQUE) - Reference code (e.g., "TS0001")
- `name` (VARCHAR) - Client name
- `company` (VARCHAR) - Company name
- `billing_address` (TEXT) - Billing address
- `office_address` (TEXT) - Office address
- `gst_number` (VARCHAR) - GST ID number
- `tax_id` (VARCHAR) - Tax ID
- `bank_details` (TEXT) - Bank information (encrypted recommended)
- `industry_type` (VARCHAR) - Industry classification
- `status` (VARCHAR, DEFAULT 'Active') - Active/Inactive/On Hold/Closed
- `notes` (TEXT) - Internal notes
- `email` (VARCHAR) - Client email
- `phone` (VARCHAR) - Client phone
- `manager_id` (INT, FK) - Assigned manager user ID
- `tenant_id` (INT, FK) - Multi-tenant isolation
- `created_by` (INT, FK) - Creator user ID
- `updated_by` (INT, FK) - Last updater user ID
- `created_at` (DATETIME) - Creation timestamp
- `updated_at` (DATETIME) - Last update timestamp
- `isDeleted` (TINYINT) - Soft delete flag
- `deleted_at` (DATETIME) - Soft delete timestamp

#### client_contacts
- `id` (INT, PK)
- `client_id` (INT, FK)
- `name` (VARCHAR)
- `email` (VARCHAR, indexed)
- `phone` (VARCHAR, indexed)
- `designation` (VARCHAR)
- `is_primary` (TINYINT, DEFAULT 0)
- `email_validated` (TINYINT, DEFAULT 0)
- `phone_validated` (TINYINT, DEFAULT 0)
- `created_at` (DATETIME)
- `updated_at` (DATETIME)

#### client_documents
- `id` (INT, PK)
- `client_id` (INT, FK)
- `file_url` (TEXT)
- `file_name` (VARCHAR)
- `file_type` (VARCHAR) - MIME type
- `document_type` (VARCHAR) - Agreement/Proposal/Compliance/Other
- `uploaded_by` (INT, FK)
- `uploaded_at` (DATETIME)
- `is_active` (TINYINT, DEFAULT 1)
- `is_deleted` (TINYINT, DEFAULT 0)

#### client_activity_logs
- `id` (INT, PK)
- `client_id` (INT, FK, indexed)
- `actor_id` (INT, FK)
- `action` (VARCHAR) - create/update/delete/etc
- `action_type` (VARCHAR, indexed)
- `details` (TEXT) - JSON of changes
- `ip_address` (VARCHAR) - IP that made the change
- `changes` (JSON) - Detailed change history
- `created_at` (DATETIME, indexed)

#### client_viewers
- `id` (INT, PK)
- `client_id` (INT, FK)
- `user_id` (INT, FK)
- `is_active` (TINYINT, DEFAULT 1)
- `created_at` (DATETIME)
- Unique constraint on (client_id, user_id)

#### onboarding_tasks
- `id` (INT, PK)
- `client_id` (INT, FK, indexed)
- `task_id` (INT, FK)
- `task_title` (VARCHAR)
- `task_description` (TEXT)
- `assigned_to` (INT, FK)
- `status` (VARCHAR, DEFAULT 'Pending', indexed)
- `due_date` (DATETIME)
- `created_at` (DATETIME)
- `completed_at` (DATETIME)

## API Endpoints

### Client CRUD
- `GET /api/clients` - List all clients with pagination and filters
- `POST /api/clients` - Create new client (Admin only)
- `GET /api/clients/:id` - Get client details
- `PUT /api/clients/:id` - Update client (Admin/Manager-assigned)
- `DELETE /api/clients/:id` - Soft delete client (Admin only)
- `POST /api/clients/:id/restore` - Restore soft-deleted client (Admin only)
- `DELETE /api/clients/:id/permanent` - Permanently delete client (Admin only)
- `POST /api/clients/:id/assign-manager` - Assign manager (Admin only)

### Contact Management
- `POST /api/clients/:id/contacts` - Add contact
- `PUT /api/clients/:id/contacts/:contactId` - Update contact
- `DELETE /api/clients/:id/contacts/:contactId` - Delete contact

### Document Management
- `POST /api/clients/:id/upload` - Upload files (multipart)
- `POST /api/clients/:id/documents` - Add documents (JSON URLs)
- `DELETE /api/clients/:id/documents/:docId` - Delete document

### Dashboard & Analytics
- `GET /api/clients/:id/dashboard` - Client dashboard with metrics

### Client-Viewer Management
- `POST /api/clients/:id/create-viewer` - Create viewer account

## Setup & Installation

### Prerequisites
- Node.js 12+ (14+ recommended)
- MySQL 5.7+
- npm or yarn

### 1. Database Setup

**Apply migration 007:**
```bash
node scripts/run_migration_007.js
```

Or manually run:
```bash
mysql -u username -p database_name < database/migrations/007_expand_clients_schema.sql
```

### 2. Dependencies

All required packages are already in `package.json`:
```bash
npm install
```

Key packages:
- `express` - Web framework
- `bcryptjs` - Password hashing
- `jsonwebtoken` - JWT authentication
- `multer` - File upload handling
- `nodemailer` - Email service
- `mysql2` - MySQL driver
- `dotenv` - Environment variables

### 3. Environment Configuration

Update `.env` with:
```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=password
DB_NAME=your_database
JWT_SECRET=your-secret-key
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

### 4. Update Routes

Update `app.js` to use the new controller:
```javascript
const clientsApi = require('./controller/ClientsApi_v2');
app.use('/api/clients', clientsApi);
```

### 5. Start the Server

```bash
npm start
# or for development with auto-reload
npm run dev
```

## Request Examples

### Create Client
```bash
curl -X POST http://localhost:3000/api/clients \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Tech Solutions Ltd",
    "company": "Tech Solutions",
    "gstNumber": "07AABCT1234H1Z0",
    "managerId": 2,
    "email": "contact@techsolutions.com",
    "createViewer": true
  }'
```

### List Clients (Manager sees only assigned)
```bash
curl -X GET 'http://localhost:3000/api/clients?page=1&limit=10' \
  -H "Authorization: Bearer YOUR_MANAGER_TOKEN"
```

### Upload Documents
```bash
curl -X POST http://localhost:3000/api/clients/1/upload \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "files=@document1.pdf" \
  -F "files=@document2.docx"
```

### Get Dashboard
```bash
curl -X GET http://localhost:3000/api/clients/1/dashboard \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Access Control Matrix

| Operation | Admin | Manager | Client-Viewer | Employee |
|-----------|-------|---------|---------------|----------|
| Create Client | ✓ | ✗ | ✗ | ✗ |
| List All Clients | ✓ | ✗ | ✗ | ✗ |
| List Assigned Clients | N/A | ✓ | ✗ | ✗ |
| List Mapped Client | N/A | N/A | ✓ | ✗ |
| Get Client Details | ✓ | ✓* | ✓* | ✗ |
| Update Client | ✓ | ✓* | ✗ | ✗ |
| Delete Client | ✓ | ✗ | ✗ | ✗ |
| Manage Contacts | ✓ | ✓* | ✗ | ✗ |
| Upload Documents | ✓ | ✓* | ✗ | ✗ |
| View Documents | ✓ | ✓* | ✓* | ✗ |
| View Dashboard | ✓ | ✓* | ✓* | ✗ |
| Create Viewer | ✓ | ✗ | ✗ | ✗ |
| Assign Manager | ✓ | ✗ | ✗ | ✗ |

_* = Only for assigned/mapped client_

## Validation Rules

### Client Creation
- `name` (required): Non-empty string
- `company` (required): Non-empty string
- `gstNumber` (optional): Indian GST format (15 alphanumeric chars)
- `email` (optional): Valid email format
- `phone` (optional): Min 10 digits, allows spaces/dashes/+ symbols
- `status` (default: 'Active'): Must be one of Active/Inactive/On Hold/Closed

### Contact Validation
- `name` (required): Non-empty string
- `email` (optional): Valid email format if provided
- `phone` (optional): Valid phone format if provided
- `is_primary` (optional): Boolean, only one primary per client

### Document Upload
- Max 20 files per request
- Supported types: PDF, DOC, DOCX, JPG, JPEG, PNG, GIF, TXT, CSV
- File size: No hard limit (configure in multer if needed)
- Storage: `/uploads` directory

## Error Handling

### Validation Error Response
```json
{
  "success": false,
  "error": "Validation failed",
  "details": {
    "gstNumber": ["Invalid GST format"],
    "email": ["Invalid email format"],
    "phone": ["Phone must be at least 10 digits"]
  }
}
```

### Access Denied Response
```json
{
  "success": false,
  "error": "Access denied: Not assigned to this client"
}
```

### Not Found Response
```json
{
  "success": false,
  "error": "Client not found"
}
```

## Standard Response Format

### Success Response
```json
{
  "success": true,
  "message": "Operation completed",
  "data": { /* operation-specific data */ }
}
```

### List Response
```json
{
  "success": true,
  "data": [ /* items */ ],
  "meta": {
    "total": 100,
    "page": 1,
    "limit": 25
  }
}
```

## Testing

### Manual Testing with Postman
1. Import `postman_complete_client_management.json` into Postman
2. Set variables: `baseUrl`, `adminToken`, `managerToken`, `viewerToken`
3. Execute requests in sequence

### Test Scenarios

**Admin Test Flow:**
1. Create client with manager assignment
2. List all clients
3. Get single client
4. Add contact
5. Upload document
6. Create viewer
7. Get dashboard
8. Update client
9. Soft delete client
10. Restore client

**Manager Test Flow:**
1. List clients (should see only assigned)
2. Get assigned client details
3. Cannot get non-assigned client (403)
4. Add contact to assigned client
5. Cannot update non-assigned client (403)

**Viewer Test Flow:**
1. Login as viewer
2. Get mapped client dashboard (200)
3. Cannot access non-mapped client (403)
4. Cannot update/delete (403)

## Performance Considerations

### Indexes
- `idx_clientss_status` - Fast status filtering
- `idx_clientss_manager_id` - Fast manager lookups
- `idx_clientss_tenant_id` - Tenant isolation queries
- `idx_client_activity_logs_action` - Action filtering
- `idx_client_activity_logs_timestamp` - Time-range queries

### Query Optimization
- Use pagination (default limit 25) to avoid large result sets
- Filter by manager_id before fetching to reduce results
- Activity logs limited to 50 most recent per client detail fetch
- Dashboard queries aggregated efficiently

### Caching Recommendations
- Cache role permissions (RBAC matrix)
- Cache manager-to-client mappings (5-min TTL)
- Cache user profile data (10-min TTL)

## Production Checklist

- [ ] Database backups configured
- [ ] Migration 007 applied
- [ ] Environment variables set in production
- [ ] HTTPS/TLS enabled
- [ ] JWT_SECRET is strong and unique
- [ ] Email credentials secured
- [ ] Upload directory permissions restricted (600)
- [ ] Log rotation configured
- [ ] Database connection pooling tuned
- [ ] Rate limiting enabled
- [ ] Input validation for all endpoints
- [ ] CORS configured appropriately
- [ ] SQL injection prevention verified
- [ ] XSS protection enabled
- [ ] CSRF tokens implemented (if using sessions)

## Troubleshooting

### Migration Fails
- Ensure table `clientss` exists before running migration
- Check MySQL user has ALTER TABLE permissions
- Verify database charset is utf8mb4

### Email Not Sending
- Check SMTP credentials in .env
- Verify firewall allows SMTP port
- Check email service logs in console

### Manager Cannot See Assigned Client
- Verify `clientss.manager_id` is set to manager's user ID
- Check manager's role is exactly 'Manager'
- Test with admin token to verify client exists

### Viewer Cannot Access Client
- Verify viewer created with `POST /clients/:id/create-viewer`
- Check `client_viewers` table has viewer mapping
- Verify viewer's role is 'Client-Viewer'
- Test viewer token is valid

## Support & Documentation

- **API Docs**: See `swagger_client_management_api.json`
- **Postman Collection**: Import `postman_complete_client_management.json`
- **Database Schema**: See `database/migrations/007_expand_clients_schema.sql`
- **Validation Rules**: See `services/ClientValidationService.js`

## License

Proprietary - All rights reserved.

---

**Last Updated**: 2024  
**Version**: 1.0.0  
**Status**: Production Ready
