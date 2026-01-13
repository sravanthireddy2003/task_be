# Document Management System - Postman Collection

This Postman collection provides comprehensive testing for the Document Management System integrated with the Task Management API.

## Features Tested

### 🔐 Authentication
- Admin login to obtain JWT token

### 📁 Project Management
- Create projects with document uploads
- Documents are automatically attached during project creation

### 👥 Client Management
- Create clients with document uploads
- Documents are automatically attached during client onboarding

### 📄 Document Management
- List all accessible documents (role-based filtering)
- Preview documents (secure access)
- Download documents (with signed URLs)
- Upload standalone documents
- Assign document access to specific users

## Setup Instructions

### 1. Import Collection
1. Open Postman
2. Click "Import" button
3. Select "File"
4. Choose `DocumentManagement.postman_collection.json`

### 2. Configure Environment
Create a new environment in Postman with these variables:
- `baseUrl`: `http://localhost:3000` (or your server URL)
- `authToken`: (will be set automatically after login)
- `projectId`: (will be set automatically after project creation)
- `clientId`: (will be set automatically after client creation)
- `documentId`: (will be set automatically after listing documents)

### 3. Prepare Test Files
Before running requests that upload documents, prepare some test files:
- PDF files (contracts, reports, etc.)
- Word documents (.doc, .docx)
- Other supported formats

## Test Flow

### 1. Authentication
Run **"Admin Login"** first to get authentication token.

### 2. Create Project with Documents
Run **"Create Project with Documents"**:
- Fill in project details
- Attach document files in the `documents` fields
- Multiple documents can be uploaded

### 3. Create Client with Documents
Run **"Create Client with Documents"**:
- Fill in client details
- Attach document files in the `documents` fields
- Multiple documents can be uploaded

### 4. Document Operations
- **"List All Documents"**: View all documents you have access to. Add `project-id` header to filter by specific project.
- **"Preview Document"**: Preview a specific document
- **"Download Document"**: Download a document with secure signed URL
- **"Upload Standalone Document"**: Upload additional documents to existing entities
- **"Assign Document Access"**: Grant specific users access to documents

## API Endpoints Covered

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Admin authentication |
| POST | `/api/projects` | Create project with documents |
| POST | `/api/clients` | Create client with documents |
| GET | `/api/documents` | List accessible documents (use `project-id` header to filter by project) |
| GET | `/api/documents/:id/preview` | Preview document |
| GET | `/api/documents/:id/download` | Download document |
| POST | `/api/documents/upload` | Upload standalone document |
| POST | `/api/documents/:id/assign-access` | Assign user access |

## Security Features

- **JWT Authentication**: All requests require valid tokens
- **Role-Based Access**: Documents filtered by user role and permissions
- **Signed URLs**: Secure document access with expiration
- **File Validation**: Type and size restrictions
- **Rule Engine**: Business rule enforcement

## File Upload Notes

- **Supported Formats**: PDF, DOC, DOCX, JPG, PNG
- **Max File Size**: 10MB per file
- **Multiple Files**: Use multiple `documents` fields for batch upload
- **Storage**: Configurable (AWS S3 or local filesystem)

## Response Examples

### Project Creation Response
```json
{
  "success": true,
  "data": {
    "id": "proj_123",
    "name": "Sample Project",
    "documents": [
      {
        "documentId": "doc_456",
        "fileName": "contract.pdf",
        "fileType": "application/pdf",
        "fileUrl": "/uploads/documents/abc123.pdf"
      }
    ]
  }
}
```

### Document List Response
```json
{
  "success": true,
  "data": [
    {
      "documentId": "doc_456",
      "fileName": "contract.pdf",
      "fileType": "application/pdf",
      "entityType": "PROJECT",
      "entityId": "proj_123",
      "uploadedBy": "admin_id",
      "createdAt": "2024-01-15T10:30:00Z"
    }
  ]
}
```

## Troubleshooting

### Common Issues
1. **401 Unauthorized**: Run login request first
2. **403 Forbidden**: Check user role permissions
3. **400 Bad Request**: Verify file formats and sizes
4. **500 Server Error**: Check server logs for details

### File Upload Tips
- Ensure files are not corrupted
- Check file size limits
- Verify supported file types
- Use proper form-data encoding

## Environment Variables

Make sure your server has these environment variables configured:
- `STORAGE_PROVIDER`: `s3` or `local`
- `AWS_S3_BUCKET`: Your S3 bucket name
- `AWS_ACCESS_KEY_ID`: AWS access key
- `AWS_SECRET_ACCESS_KEY`: AWS secret key
- `AWS_REGION`: AWS region

## Support

For issues with the API or collection:
1. Check server logs
2. Verify database tables exist (`documents`, `document_access`)
3. Ensure rule engine is properly configured
4. Test with different user roles