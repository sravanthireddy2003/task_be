# Architecture Diagram - Fixed Request Flow

## BEFORE (❌ BROKEN)
```
┌─────────────────────────────────────────────────────────────┐
│  Client sends POST with Authorization Bearer token          │
└────────────────────────┬────────────────────────────────────┘
                         ↓
        ┌────────────────────────────────────┐
        │  tenantMiddleware                  │
        ├────────────────────────────────────┤
        │ - Check x-tenant-id header        │
        │ - Check request body/query        │
        │ - If not found...                 │
        │                                    │
        │  ❌ REJECT: 400 "Missing tenant"  │
        │     (Prevents auth check!)        │
        └────────────────────────────────────┘
                         ↓
                    ❌ REQUEST BLOCKED
              Response: "Missing tenant id and 
                        invalid/expired token"
              
              requireAuth NEVER RUNS ❌
```

---

## AFTER (✅ FIXED)
```
┌─────────────────────────────────────────────────────────────┐
│  Client sends POST with Authorization Bearer token          │
└────────────────────────┬────────────────────────────────────┘
                         ↓
        ┌────────────────────────────────────┐
        │  tenantMiddleware                  │
        ├────────────────────────────────────┤
        │ - Check x-tenant-id header        │
        │ - Check request body/query        │
        │ - Try to derive from token        │
        │ - Attach req.tenantId (or skip)   │
        │                                    │
        │  ✅ PASS THROUGH: next()          │
        └────────────────────────────────────┘
                         ↓
        ┌────────────────────────────────────┐
        │  requireAuth Middleware            │
        ├────────────────────────────────────┤
        │ - Verify JWT signature            │
        │ - Check token expiration          │
        │ - Load user from database         │
        │ - Verify tenant match             │
        │ - Attach req.user object          │
        │                                    │
        │  ✅ Valid Token: continue         │
        │  ❌ Invalid Token: 401 response   │
        └────────────────────────────────────┘
                         ↓
        ┌────────────────────────────────────┐
        │  requireRole Middleware            │
        ├────────────────────────────────────┤
        │ - Check user.role against         │
        │   required roles for endpoint     │
        │                                    │
        │  ✅ Valid Role: continue          │
        │  ❌ Invalid Role: 403 response    │
        └────────────────────────────────────┘
                         ↓
        ┌────────────────────────────────────┐
        │  Route Handler (e.g., createjson) │
        ├────────────────────────────────────┤
        │ - Process task creation           │
        │ - Use req.user for audit log      │
        │ - Send response                   │
        └────────────────────────────────────┘
                         ↓
        ┌────────────────────────────────────┐
        │  ✅ SUCCESS RESPONSE (201/200)    │
        │  Task created with data           │
        └────────────────────────────────────┘
```

---

## Middleware Stack Comparison

### Before
```
tenantMiddleware ─→ ❌ BLOCKS REQUEST
                    (rejects before auth)
                    ↓
               requireAuth (NEVER RUNS)
                    ↓
               requireRole (NEVER RUNS)
```

### After
```
tenantMiddleware ─→ ✅ RESOLVES TENANT
                    (passes to next)
                    ↓
               requireAuth ─→ ✅ VALIDATES TOKEN
                    (passes if valid)
                    ↓
               requireRole ─→ ✅ VALIDATES ROLE
                    (passes if authorized)
                    ↓
               ROUTE HANDLER (processes request)
```

---

## Email Service Flow

```
┌──────────────────────────────────────────┐
│  POST /api/users/create (Admin only)     │
│  { name, email, role, ... }              │
└────────────────┬─────────────────────────┘
                 ↓
    ┌────────────────────────────────────┐
    │  User Controller                   │
    ├────────────────────────────────────┤
    │ 1. Validate input                 │
    │ 2. Check if email exists          │
    │ 3. Generate tempPassword          │
    │ 4. Generate setupToken (JWT)      │
    │ 5. Hash password + insert to DB   │
    └────────────────────────────────────┘
                 ↓
    ┌────────────────────────────────────┐
    │  emailService.sendEmail()          │
    ├────────────────────────────────────┤
    │ (Fire-and-forget, doesn't block)   │
    │                                    │
    │ ┌──────────────────────────────┐  │
    │ │ Try SMTP Send                │  │
    │ └────────┬───────────────────┬─┘  │
    │          │ Success           │    │
    │       ✅ Send               ⚠️ Fallback
    │          │                   │    │
    │          │              Log to console
    │          ↓                   ↓    │
    │       Database          DEV OUTPUT
    │       (optional)              │    │
    └────────────────────────────────────┘
                 ↓
    ┌────────────────────────────────────┐
    │  Return to Client (201 Created)    │
    ├────────────────────────────────────┤
    │ {                                  │
    │   "success": true,                 │
    │   "data": {                        │
    │     "id": "public_id",             │
    │     "name": "New User",            │
    │     "email": "user@example.com",   │
    │     "tempPassword": "a1b2c3d4e5f6",│
    │     "setupToken": "eyJhbGc..."    │
    │   }                                │
    │ }                                  │
    └────────────────────────────────────┘
          ↓                         ↓
    (User receives       (Email sent/logged
     response            to console)
     immediately)
```

---

## Request Lifecycle - Task Creation

### Step 1: Authentication
```
Request: POST /api/tasks/createjson
Header:  Authorization: Bearer <token>
         
         ↓ (tenantMiddleware)
         
req.tenantId = resolved from token (or provided)

         ↓ (requireAuth)
         
req.user = {
  _id: 123,
  id: "public_id",
  email: "admin@example.com",
  name: "Admin",
  role: "Admin",
  tenant_id: "tenant_1"
}
```

### Step 2: Authorization
```
         ↓ (requireRole(['Admin', 'Manager']))
         
user.role = "Admin" ✅ (matches allowed roles)

         ↓ (passes to route handler)
```

### Step 3: Processing
```
         ↓ (route handler)
         
- Validate task data
- Insert into tasks table
- Create task assignments
- Log activity
- Return 201 Created

         ↓
         
Response: {
  "success": true,
  "taskId": 456,
  "message": "Task created successfully"
}
```

---

## Error Handling Flow

```
┌─────────────────────────────────┐
│  Invalid Request Scenarios       │
└──────────────┬──────────────────┘

 ┌────────────────────────────────┐
 │ No Authorization Header        │
 ├────────────────────────────────┤
 │ requireAuth CATCHES this       │
 │ Response: 401                  │
 │ "Missing or invalid auth"      │
 └────────────────────────────────┘

 ┌────────────────────────────────┐
 │ Invalid/Expired Token          │
 ├────────────────────────────────┤
 │ requireAuth VALIDATES          │
 │ Response: 401                  │
 │ "Invalid token"                │
 └────────────────────────────────┘

 ┌────────────────────────────────┐
 │ Valid Token, Wrong Role        │
 ├────────────────────────────────┤
 │ requireRole VALIDATES           │
 │ Response: 403                  │
 │ "Insufficient role"            │
 └────────────────────────────────┘

 ┌────────────────────────────────┐
 │ Valid Auth, Invalid Data       │
 ├────────────────────────────────┤
 │ Route Handler VALIDATES        │
 │ Response: 400                  │
 │ "Missing required field"       │
 └────────────────────────────────┘
```

---

## Configuration Sources (Priority Order)

```
Tenant Resolution:
  1. x-tenant-id header         ← Highest priority
  2. tenantId in request body
  3. tenantId in query params
  4. Derived from JWT token
  5. Not set (allowed)          ← Lowest priority

Token:
  1. Authorization: Bearer <token> header
     
Secret Key:
  1. process.env.SECRET environment variable
  2. 'secret' hardcoded fallback

SMTP Configuration:
  1. SMTP_HOST environment variable
  2. If all SMTP vars present → Send real email
  3. Otherwise → Log to console (dev fallback)
```

---

## Key Improvements

| Aspect | Before | After |
|--------|--------|-------|
| **Tenant Check** | Blocking ❌ | Non-blocking ✅ |
| **Auth Flow** | Blocked ❌ | Flows properly ✅ |
| **Error Messages** | Wrong ❌ | Accurate ✅ |
| **Email Sending** | Not imported ❌ | Ready to use ✅ |
| **User Creation** | Already working ✅ | Verified working ✅ |
| **API Accessibility** | Blocked ❌ | Accessible ✅ |

---

**Status:** ✅ ALL FIXED  
**Last Updated:** December 11, 2025
