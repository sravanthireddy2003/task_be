# 🔧 Quick Fix: 403 Forbidden on /api/users/getusers

## ❌ The Error

```
Status: 403 Forbidden
Message: "Insufficient role"
```

---

## ✅ The Solution

The endpoint requires **Admin authentication**. You need to:

### Step 1: Login as Admin

```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "korapatiashwini@gmail.com",
    "password": "admin123"
  }'
```

**Response contains:** `"token": "eyJhbGc..."`

### Step 2: Use Token to Get Users

```bash
curl -X GET http://localhost:4000/api/users/getusers \
  -H "Authorization: Bearer eyJhbGc..."
```

---

## 🔑 Admin Credentials

| Email | Password |
|-------|----------|
| korapatiashwini@gmail.com | admin123 |

---

## 📋 Required Headers

```
GET /api/users/getusers HTTP/1.1
Host: localhost:4000
Authorization: Bearer <YOUR_TOKEN_HERE>
Content-Type: application/json
```

---

## 🧪 Test It

```bash
node test_get_users.js
```

This will automatically:
- Login as Admin
- Fetch all users
- Display in table format

---

## 📊 What You Get

List of all users with:
- ID
- Name
- Email
- Role (Admin, Manager, Employee, Client-Viewer)
- Phone
- Active Status
- Created Date

---

## 🚀 Postman Setup

1. **First Request (Login):**
   - Method: POST
   - URL: `http://localhost:4000/api/auth/login`
   - Body: `{"email":"korapatiashwini@gmail.com","password":"admin123"}`

2. **Second Request (Get Users):**
   - Method: GET
   - URL: `http://localhost:4000/api/users/getusers`
   - Header: `Authorization: Bearer <token from step 1>`

---

## ✅ Success Response

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
  // ... more users
]
```

---

**Status:** ✅ **FIXED - Use Admin token to access**

