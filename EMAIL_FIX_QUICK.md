# 🔧 Email Delivery Fix - Quick Reference

## Problem
```json
{
  "success": true,
  "data": { "id": 40, "ref": "AA10001", "name": "...", "company": "..." },
  "viewer": { "publicId": "..." }
}
// ❌ But email never received!
```

## Root Cause
The `setupLink` parameter was missing when calling `emailService.sendCredentials()`.

The function requires 5 parameters:
```javascript
sendCredentials(to, name, publicId, tempPassword, setupLink)
                 1   2     3         4             5 ❌ MISSING
```

Without `setupLink`, the email template is incomplete and email fails silently.

---

## Fix Applied ✅

**File:** `controller/ClientsApi_v2.js`
**Lines:** 320 and 728

**Before:**
```javascript
const emailResult = await emailService.sendCredentials(
  email, name, publicId, tempPassword
);
```

**After:**
```javascript
const setupLink = `${process.env.FRONTEND_URL || process.env.BASE_URL || 'http://localhost:3000'}/auth/setup?uid=${encodeURIComponent(publicId)}`;
const emailResult = await emailService.sendCredentials(
  email, name, publicId, tempPassword, setupLink
);
```

---

## Verify the Fix

### Check Logs After Creating Client
```bash
# Look for these messages in application logs:
Viewer credentials sent to EMAIL@ADDRESS: Success
emailService: sendEmail...
```

### Test Email Delivery
```bash
bash test_email_delivery.sh
```

### Manual Test
1. Create client with viewer via API
2. Check inbox for email from `SMTP_FROM` address
3. Email should contain:
   - ✅ Viewer's temporary password
   - ✅ Clickable setup link
   - ✅ Welcome message

---

## Environment Requirements

**.env file must have:**
```dotenv
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=your-email@gmail.com
FRONTEND_URL=http://localhost:3000  # or your frontend URL
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Email not received | Check SMTP_* env vars, check spam folder |
| Setup link broken | Verify FRONTEND_URL env var is correct |
| Error in logs | Check SMTP credentials and firewall |
| Success but no email | May be delayed; wait 5-10 seconds |

---

## Files Modified
- `controller/ClientsApi_v2.js` ✅

## Files Created
- `EMAIL_DELIVERY_FIX.md` (detailed documentation)
- `test_email_delivery.sh` (automated test)

---

**Status:** ✅ **FIXED AND READY TO TEST**

