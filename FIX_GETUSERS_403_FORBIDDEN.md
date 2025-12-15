# ✅ FIX: 403 Forbidden "Insufficient role" on /api/users/getusers

## Problem

**Error Response:**
```
Status Code: 403 Forbidden
Response: {"message":"Insufficient role"}
```

**Endpoint:** `GET http://localhost:4000/api/users/getusers`

---

## Root Cause

The `/api/users/getusers` endpoint requires **Admin role** to access. The request was either:
1. ❌ Missing Authorization header
2. ❌ Using invalid/expired token
3. ❌ Using a token for non-Admin user (Manager, Employee, Client-Viewer)

---

## Solution

### What the Endpoint Requires

```javascript
router.get("/getusers", requireRole('Admin'), (req, res) => {
  // Only Admin users can access this endpoint
});
```

**Authorization Required:** ✅ **Admin role only**

### How to Access the Endpoint

#### 1. Login as Admin First

```bash
POST /api/auth/login
Content-Type: application/json

{
  "email": "korapatiashwini@gmail.com",
  "password": "admin123"
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "...",
  "user": {
    "id": "ac510b2dd0e311f088c200155daedf50",
    "name": "Admin User",
    "role": "Admin",
    "email": "korapatiashwini@gmail.com"
  }
}
```

#### 2. Use Token to Access Users Endpoint

```bash
GET /api/users/getusers
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response:**
```json
[
  {
    "id": "ac510b2dd0e311f088c200155daedf50",
    "name": "Admin User",
    "email": "korapatiashwini@gmail.com",
    "role": "Admin",
    "phone": "9513035255",
    "isActive": true,
    "createdAt": "2025-12-03T10:30:00Z"
  },
  {
    "id": "ac510bacd0e311f0...",
    "name": "Manager User",
    "email": "manager@tenant-1.example.com",
    "role": "Manager",
    "phone": null,
    "isActive": true,
    "createdAt": "2025-12-03T10:30:00Z"
  }
  // ... more users
]
```

---

## Admin Users in System

| Email | Password | Role | Status |
|-------|----------|------|--------|
| korapatiashwini@gmail.com | admin123 | Admin | ✅ Active |
| testdev@tenant-1.example.com | [set password] | Admin | ✅ Active |

---

## Working Example

### Using cURL

```bash
# Step 1: Login
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"korapatiashwini@gmail.com","password":"admin123"}'

# Extract token from response (JWT format)

# Step 2: Get users with token
curl -X GET http://localhost:4000/api/users/getusers \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### Using Postman

1. **Create Login Request:**
   - Method: POST
   - URL: `http://localhost:4000/api/auth/login`
   - Body (JSON):
     ```json
     {
       "email": "korapatiashwini@gmail.com",
       "password": "admin123"
     }
     ```
   - Send request
   - Copy the `token` value from response

2. **Create Get Users Request:**
   - Method: GET
   - URL: `http://localhost:4000/api/users/getusers`
   - Headers:
     - Key: `Authorization`
     - Value: `Bearer <paste_token_here>`
   - Send request

---

## Users Currently in System

### Retrieved from GET /api/users/getusers

| # | Name | Email | Role | Phone | Active | Created |
|---|------|-------|------|-------|--------|---------|
| 1 | Admin User | korapatiashwini@gmail.com | Admin | 9513035255 | ✅ | 12/3/2025 |
| 2 | Manager User | manager@tenant-1.example.com | Manager | — | ✅ | 12/3/2025 |
| 3 | Employee User | employee@tenant-1.example.com | Employee | — | ✅ | 12/3/2025 |
| 4 | Test Dev | testdev@tenant-1.example.com | Admin | — | ✅ | 12/4/2025 |
| 5 | Akash | akashcherry8414@gmail.com | Employee | 8296118414 | ✅ | 12/4/2025 |
| 6 | Ashwini M | aashv143@gmail.com | Manager | 09513035255 | ✅ | 12/5/2025 |
| 7 | Test Client Ashwini (Viewer) | ashwini.m@nmit-solutions.com | Client-Viewer | — | ✅ | 12/11/2025 |

---

## Authorization Rules

### Endpoint Access by Role

| Endpoint | Admin | Manager | Employee | Client-Viewer |
|----------|-------|---------|----------|---------------|
| `GET /api/users/getusers` | ✅ | ❌ | ❌ | ❌ |
| `POST /api/users/create` | ✅ | ❌ | ❌ | ❌ |
| `GET /api/users/:id` | ✅ | ✅ | ✅ | ❌ |
| `PUT /api/users/:id` | ✅ | ✅ | ✅ | ❌ |

---

## Troubleshooting

### Error: "Missing or invalid Authorization header"
**Cause:** No Authorization header provided
**Solution:** Add header: `Authorization: Bearer <token>`

### Error: "Invalid token"
**Cause:** Token expired or invalid SECRET
**Solution:** Login again to get fresh token

### Error: "Insufficient role"
**Cause:** Logged in as non-Admin user
**Solution:** Login as Admin (korapatiashwini@gmail.com)

### Error: "User not found"
**Cause:** Token references deleted user
**Solution:** Login again with valid credentials

---

## API Middleware Stack

```
Request
  ↓
tenantMiddleware (resolves tenant from header/token)
  ↓
requireAuth (validates JWT token, extracts user)
  ↓
requireRole('Admin') (checks if user.role === 'Admin')
  ↓
Route Handler (processes request)
```

---

## Token Structure

**JWT Token Payload:**
```json
{
  "id": "ac510b2dd0e311f088c200155daedf50",  // public_id
  "iat": 1764841321,                          // issued at
  "exp": 1764870121                           // expires in 8 hours
}
```

**Token Valid For:** 8 hours (28,800 seconds)

---

## Testing

### Run Automated Test
```bash
node test_get_users.js
```

This will:
1. ✅ Login as Admin
2. ✅ Get token
3. ✅ Fetch users list
4. ✅ Display all users in table format

---

## Summary

| Item | Status |
|------|--------|
| Endpoint Working | ✅ Yes |
| Authorization Working | ✅ Yes |
| Admin Authentication | ✅ Yes |
| Users Retrievable | ✅ Yes (7 users) |
| Role Validation | ✅ Strict (Admin only) |

**Total Users:** 7
**Admin Users:** 2
**Manager Users:** 2
**Employee Users:** 2
**Client-Viewer Users:** 1

---

**Status:** ✅ **WORKING CORRECTLY** - Use proper Admin authentication to access

