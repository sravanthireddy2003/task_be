# Email Not Received - Troubleshooting & Fix Guide

## Issue Summary
Client viewer credentials email was not being sent when:
1. Admin creates a client with `createViewer: true`
2. Admin manually creates a viewer account via `/api/clients/:id/create-viewer`

**Root Causes**:
1. ❌ `emailService.sendCredentials()` was NOT being awaited - async operation was fire-and-forget
2. ❌ Errors in email sending were not properly logged
3. ❌ SMTP configuration might not be set in environment variables

---

## ✅ Fix Applied

### What Was Fixed
- **Line 320**: Now properly `await`s email sending with error logging
- **Line 728**: Now properly `await`s email sending with error logging  
- Added success/failure logging to track email delivery

**Before**:
```javascript
try {
  emailService.sendCredentials(email, name, publicId, tempPassword); // ❌ Not awaited!
} catch (e) {
  logger.warn('Failed to send credentials: ' + e.message);
}
```

**After**:
```javascript
try {
  const emailResult = await emailService.sendCredentials(email, name, publicId, tempPassword); // ✅ Awaited!
  logger.info(`Viewer credentials sent to ${email}: ${emailResult.sent ? 'Success' : 'Failed'}`);
} catch (e) {
  logger.error('Failed to send credentials: ' + e.message);
}
```

---

## 🔧 Additional Setup Required

### Step 1: Configure SMTP in .env
For emails to actually send, you MUST set SMTP configuration:

```bash
# .env file
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_SECURE=false
SMTP_FROM=your-email@gmail.com
BASE_URL=http://localhost:3000
FRONTEND_URL=http://localhost:3000
```

### Step 2: Gmail SMTP Setup (Recommended)
If using Gmail:

1. Enable 2-Factor Authentication on your Google Account
2. Generate an "App Password":
   - Go to https://myaccount.google.com/apppasswords
   - Select "Mail" and "Windows Computer"
   - Copy the 16-character password
3. Use that password as `SMTP_PASS` in .env

### Step 3: Test SMTP Configuration
```bash
# Run test to verify SMTP works
node -e "
const nodemailer = require('nodemailer');
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT),
  secure: process.env.SMTP_SECURE === 'true',
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
});
transporter.verify((err, valid) => {
  if (err) console.log('SMTP Error:', err);
  else console.log('SMTP Valid:', valid);
});
"
```

---

## 📋 Testing the Fix

### Test 1: Create Client with Viewer
```bash
curl -X POST http://localhost:3000/api/clients \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Client",
    "company": "Test Co",
    "email": "client@example.com",
    "phone": "1234567890",
    "status": "Active",
    "createViewer": true,
    "contacts": [{
      "name": "John Doe",
      "email": "john@example.com",
      "phone": "9876543210"
    }]
  }'
```

**Expected Response**:
```json
{
  "success": true,
  "data": { "id": 36, "ref": "AA 0002", "name": "Test Client" },
  "viewer": { "publicId": "abc123def456", "userId": 42 }
}
```

**Server Logs Should Show**:
```
✓ Viewer credentials sent to john@example.com: Success
```

### Test 2: Create Viewer on Existing Client
```bash
curl -X POST http://localhost:3000/api/clients/36/create-viewer \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "New Viewer",
    "email": "viewer@example.com",
    "send_credentials": true
  }'
```

**Expected Response**:
```json
{
  "success": true,
  "data": {
    "publicId": "xyz789abc123",
    "userId": 43,
    "email": "viewer@example.com"
  }
}
```

**Server Logs Should Show**:
```
✓ Viewer credentials sent to viewer@example.com: Success
```

---

## 🐛 Debugging Email Issues

### If Email Still Not Received:

#### Check 1: Verify SMTP Configuration
```bash
# In your app, add logging to see SMTP status
console.log('SMTP Configured:', process.env.SMTP_HOST && process.env.SMTP_USER);
```

#### Check 2: Check Server Logs for Errors
Look for these log messages:
```
✓ emailService: SMTP verified
✓ Viewer credentials sent to ...@...: Success
```

Or these error messages:
```
✗ emailService: SMTP verify failed
✗ emailService: sendMail failed
✗ Failed to send credentials: ...
```

#### Check 3: Verify Email Address
- Ensure email format is valid (contains @ and domain)
- Check for typos in the email address in request payload
- Look at logs: `logger.info()` calls now show which email was attempted

#### Check 4: Gmail Specific
- Check "Less secure apps" settings if using Gmail
- Or use App Password (recommended method above)
- Check Gmail spam folder
- Gmail may reject emails from non-gmail addresses

#### Check 5: Check Database
After client creation, verify data was saved:
```sql
-- Check if client was created
SELECT id, name, email FROM clientss WHERE name = 'Test Client';

-- Check if viewer was created
SELECT * FROM client_viewers WHERE client_id = 36;

-- Check if user account created
SELECT public_id, email, role FROM users WHERE role = 'Client-Viewer' ORDER BY createdAt DESC LIMIT 1;

-- Check activity logs
SELECT * FROM client_activity_logs WHERE client_id = 36 ORDER BY created_at DESC;
```

---

## 📧 Email Template Information

The viewer credentials email includes:
- **Subject**: "Your account has been created"
- **Content**:
  - Welcome message with name
  - Login email (provided email)
  - Temporary password (random 12 hex characters)
  - Setup link: `{BASE_URL}/auth/setup?uid={publicId}`

---

## 🔒 Security Notes

1. **Temporary Passwords**: Are secure random values, changed on first login
2. **Public ID**: Used for password reset and viewer account access, not user's real ID
3. **Email Verification**: Client contacts' emails are validated before use
4. **SMTP Credentials**: Store in .env, never commit to git

---

## Next Steps

1. ✅ **Update app.js** to use `ClientsApi_v2.js`:
   ```javascript
   const clientsApi = require('./controller/ClientsApi_v2');
   app.use('/api/clients', clientsApi);
   ```

2. ✅ **Restart server**:
   ```bash
   npm start
   ```

3. ✅ **Configure SMTP** in .env file

4. ✅ **Test** client creation with viewer account

5. ✅ **Check logs** for "Viewer credentials sent" message

---

## Support

If emails still not arriving:
1. Check `.env` file for SMTP settings
2. Review server logs for error messages starting with "emailService:"
3. Verify inbox and spam folder
4. Test SMTP connection separately
5. Check email address in client creation payload

**File Modified**: `controller/ClientsApi_v2.js` (Lines 320 & 728)
