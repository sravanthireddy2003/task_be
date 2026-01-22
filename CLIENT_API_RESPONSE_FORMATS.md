# Client API Response Formats

## POST /api/clients - Create Client (201 Created)

### Response Example:
```json
{
  "success": true,
  "message": "Client created successfully",
  "data": {
    "id": 42,
    "ref": "QTC0001",
    "name": "Quick Test Client",
    "company": "Quick Test Company",
    "email": "quicktest@example.com",
    "phone": "8786788484",
    "status": "Active",
    "managerId": 24,
    "documentsCount": 0,
    "contactsCount": 2,
    "viewerInfo": {
      "publicId": "abc123def456",
      "userId": 45,
      "role": "Client-Viewer"
    },
    "clientCredentials": {
      "email": "quicktest@example.com",
      "publicId": "xyz789abc123"
    }
  }
}
```

### Response Fields:
- `id`: The created client's internal ID
- `ref`: The auto-generated reference number (e.g., "QTC0001")
- `name`: Client name
- `company`: Company name
- `email`: Primary contact email (from contacts or body)
- `phone`: Contact phone number
- `status`: Client status (Active/Inactive)
- `managerId`: Assigned manager's ID (if any)
- `documentsCount`: Number of documents attached
- `contactsCount`: Number of contacts created
- `viewerInfo`: Portal user created for the client (if portal enabled)
- `clientCredentials`: Email and public ID of client user account

---

## PUT /api/clients/:id - Update Client (200 OK)

### Response Example:
```json
{
  "success": true,
  "message": "Client updated successfully",
  "data": {
    "id": 42,
    "updatedFields": [
      "name",
      "phone",
      "status"
    ],
    "updates": {
      "name": "Updated Client Name",
      "phone": "9876543210",
      "status": "Inactive"
    }
  }
}
```

### Response Fields:
- `id`: The updated client's ID
- `updatedFields`: Array of field names that were updated
- `updates`: Object containing the actual values sent in the request

---

## Old Response Format (No Longer Used)

### Before:
```json
{
  "success": true,
  "message": "Client updated"
}
```

The old format provided no confirmation of what was actually updated or the client ID affected.

---

## Benefits of New Response Format

✅ **Clear Confirmation**: Frontend can confirm exactly what was created/updated  
✅ **Client ID**: Gets the newly created client's ID immediately  
✅ **Reference Number**: Useful for tracking and customer communication  
✅ **Audit Trail**: Shows exactly which fields were modified  
✅ **Portal Setup**: Confirms if portal/viewer account was created  
✅ **Credentials Tracking**: Know if client credentials were generated  

---

## Error Responses (Unchanged)

### 400 Bad Request:
```json
{
  "success": false,
  "error": "name and company required"
}
```

### 404 Not Found (Manager):
```json
{
  "success": false,
  "error": "Manager not found"
}
```

### 500 Server Error:
```json
{
  "success": false,
  "error": "Error message describing what went wrong"
}
```

---

## Usage in Frontend

### After Create:
```javascript
const response = await fetch('/api/clients', { method: 'POST', ... });
const result = await response.json();

if (result.success) {
  console.log(`✅ Client "${result.data.name}" created with ID ${result.data.id}`);
  console.log(`Reference: ${result.data.ref}`);
  
  if (result.data.viewerInfo) {
    console.log(`Portal created for ${result.data.viewerInfo.userId}`);
  }
}
```

### After Update:
```javascript
const response = await fetch(`/api/clients/${clientId}`, { method: 'PUT', ... });
const result = await response.json();

if (result.success) {
  console.log(`✅ Updated ${result.data.updatedFields.length} fields`);
  console.log(`Changes: `, result.data.updates);
}
```
