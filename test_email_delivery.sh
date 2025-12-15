#!/bin/bash
# Test email delivery for client viewer credentials

BASE_URL="http://localhost:4000"
ADMIN_EMAIL="admin@example.com"
ADMIN_PASS="Admin@123"

echo "=== Email Delivery Test ==="
echo ""

# Get admin token
echo "[1/3] Getting admin token..."
LOGIN=$(curl -s -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"public_id\": \"admin\", \"password\": \"admin\"}")

TOKEN=$(echo "$LOGIN" | jq -r '.token // empty')

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  echo "❌ Failed to get token"
  echo "$LOGIN" | jq .
  exit 1
fi

echo "✅ Token received: ${TOKEN:0:20}..."
echo ""

# Test 1: Create client with viewer
echo "[2/3] Creating client with viewer..."
TEST_EMAIL="testviewer_$(date +%s)@example.com"

CREATE=$(curl -s -X POST "$BASE_URL/api/clients" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"Test Client $(date +%s)\",
    \"company\": \"Test Company\",
    \"createViewer\": true,
    \"contacts\": [
      {
        \"name\": \"Test Viewer\",
        \"email\": \"$TEST_EMAIL\"
      }
    ]
  }")

echo "$CREATE" | jq .
echo ""

# Check if email was marked as sent
SUCCESS=$(echo "$CREATE" | jq '.success')
VIEWER=$(echo "$CREATE" | jq '.viewer')

if [ "$SUCCESS" = "true" ] && [ "$VIEWER" != "null" ]; then
  echo "✅ Client created with viewer: $VIEWER"
  echo "✅ Check logs for: 'Viewer credentials sent to $TEST_EMAIL'"
  echo ""
  echo "[3/3] Waiting for email delivery (check your inbox for: $TEST_EMAIL)"
  echo "      Expected email subject: 'Your account has been created'"
  echo "      Expected to contain: temporary password and setup link"
else
  echo "❌ Failed to create client with viewer"
  exit 1
fi

echo ""
echo "=== Test Complete ==="
echo ""
echo "Summary:"
echo "- If email received: ✅ Email delivery is working"
echo "- If no email: Check SMTP_* variables in .env"
echo "- Check application logs for 'emailService' messages"
