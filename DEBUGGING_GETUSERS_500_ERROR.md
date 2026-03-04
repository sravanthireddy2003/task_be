# Debugging `/users/getusers` 500 Error

## Issue Summary
Getting `{"error":"Failed to fetch users"}` 500 error on live server while it works locally.

## Root Causes Identified & Fixed

### 1. **Corrupted `.env` File** ✅ FIXED
Your `.env` file had debug information mixed in at the top, causing environment configuration loading to fail.

**Missing Critical Variables:**
- `DB_HOST` - Database server address
- `DB_PORT` - Database port
- `DB_USER` - Database username
- `DB_PASSWORD` - Database password
- `DB_NAME` - Database name
- `FRONTEND_URL` - Frontend application URL
- `BASE_URL` - Backend base URL
- `NODE_ENV` - Environment (production/development)
- `PORT` - Server port

These are validated in `src/config/env.js` and if missing, the entire application fails to start properly.

### 2. **Insufficient Error Logging** ✅ FIXED
The endpoint wasn't providing detailed error information in responses.

**Improvements Applied:**
- Enhanced error response to include `errorType` and `details`
- Added comprehensive logging at each query step
- Added debug middleware to log incoming requests
- Wrapped entire route with `asyncHandler` to catch all errors
- Error messages now differentiate between production (minimal) and development (detailed)

## What Was Changed

### Changes to [src/controllers/User.js](src/controllers/User.js)

1. **Enhanced error logging in table/column checks:**
   - Added `logger.info()` calls for debugging table existence and columns
   - Helps identify schema differences between local and live databases

2. **Added debug middleware:**
   ```javascript
   router.get("/getusers", (req, res, next) => {
     logger.info('[getusers] Incoming request from:', req.user?._id, 'role:', req.user?.role);
     next();
   }, ...)
   ```

3. **Wrapped route with asyncHandler:**
   - Catches all async errors and middleware errors
   - Provides structured error responses

4. **Enhanced error response:**
   ```javascript
   res.status(500).json({
     error: "Failed to fetch users",
     errorType,      // e.g., "SQL_ER_NO_SUCH_TABLE"
     details,        // Detailed error message
     code: err.code  // Database error code
   });
   ```

## Steps to Fix On Live Server

### 1. Update `.env` File
Replace your `.env` file with the cleaned version. Make sure to set:

```env
NODE_ENV=production
PORT=4000

# Update these with your ACTUAL live database credentials
DB_HOST=your-live-db-host
DB_PORT=3306
DB_USER=your-db-user
DB_PASSWORD=your-db-password
DB_NAME=your-db-name

# Set valid JWT secrets (at least 32 characters)
JWT_SECRET=your-actual-32-char-secret-key
SECRET=your-actual-32-char-secret-key

# Update these URLs
FRONTEND_URL=http://43.205.56.233:3000
BASE_URL=http://43.205.56.233:4000
```

### 2. Deploy Updated Code
Push the updated [src/controllers/User.js](src/controllers/User.js) to your live server.

### 3. Restart Application
```bash
# Kill existing process and restart
pm2 restart app
# or
systemctl restart your-app-service
```

### 4. Test Endpoint
```bash
curl -X GET http://43.205.56.233:4000/api/users/getusers \
  -H "Authorization: Bearer your-auth-token"
```

### 5. Check Live Logs
On live server, check application logs:
```bash
# If using PM2
pm2 logs

# If using systemd
journalctl -u your-app-service -f

# If using docker
docker logs -f container-name
```

Look for:
- `[getusers] Incoming request` - confirms request reaches endpoint
- `[getusers] Checking columns for table` - confirms schema checks
- `SQLError` messages - shows specific database issues

## Common Issues to Check

### Issue: "ER_NO_SUCH_TABLE"
**Cause:** Required table doesn't exist in live database
**Solution:** Run database migrations
```bash
node migrate.js
# or
npm run migrate
```

### Issue: "ER_BAD_FIELD_ERROR"
**Cause:** Database schema differs from code expectations
**Solution:** 
1. Check which columns are reported as missing in logs
2. Run schema sync or migrations
3. Verify database structure matches local development

### Issue: "ER_ACCESS_DENIED_FOR_USER"
**Cause:** Wrong database credentials in `.env`
**Solution:** Verify DB_USER and DB_PASSWORD match your live database

### Issue: Authentication errors before reaching route
**Cause:** JWT validation failing or user not authenticated
**Solution:** 
1. Check `Authorization` header is being sent
2. Verify JWT token is valid
3. Check auth middleware in [src/middleware/roles.js](src/middleware/roles.js)

## Monitoring After Fix

### Production Monitoring
Add these to your monitoring:
1. **Error Rate:** Track 500 errors on `/api/users/getusers`
2. **Response Time:** Monitor query performance
3. **Database Connectivity:** Check for connection pool issues
4. **Log Aggregation:** Forward logs from `[getusers]` to centralized logging

### Log Patterns to Watch For
```
✅ Success: [getusers] Successfully fetched X users
❌ DB Error: [[getusers] Error checking columns for table
❌ DB Error: Error fetching users: ER_NO_SUCH_TABLE
❌ Auth Error: [getusers] Incoming request from: undefined (not authenticated)
```

## Documentation Files for Reference
- [src/config/env.js](src/config/env.js) - Environment validation schema
- [src/controllers/User.js](src/controllers/User.js) - Updated getusers endpoint
- [src/middleware/ruleEngine.js](src/middleware/ruleEngine.js) - Authorization rules
- [src/middleware/roles.js](src/middleware/roles.js) - Authentication middleware

## Prevention Tips

1. **Always validate `.env` before deployment**
   ```bash
   npm run validate-env
   ```

2. **Test on staging before production**
   - Set `NODE_ENV=staging` to test with production-like configuration

3. **Enable structured logging in production**
   - Helps identify issues faster

4. **Keep local and live database schemas in sync**
   - Run migrations on both environments

5. **Monitor failed authentication attempts**
   - Could indicate token/JWT issues
