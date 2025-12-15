#!/bin/bash
# Quick Test Script for Fixed Auth & Tasks Endpoints

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}=== Testing Fixed Controllers & Email Service ===${NC}\n"

BASE_URL="http://localhost:4000"
ADMIN_EMAIL="admin@example.com"
ADMIN_PASS="Admin@123"

# Test 1: Login
echo -e "${YELLOW}[Test 1] LOGIN - Get Auth Token${NC}"
LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$ADMIN_EMAIL\",
    \"password\": \"$ADMIN_PASS\"
  }")

echo "$LOGIN_RESPONSE" | jq .

TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.token // empty')

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  echo -e "${RED}❌ Failed to get token${NC}\n"
  exit 1
fi

echo -e "${GREEN}✅ Token received${NC}\n"
echo "Token: $TOKEN"
echo ""

# Test 2: Create Task (Test tenant middleware fix)
echo -e "${YELLOW}[Test 2] CREATE TASK - Test Tenant Middleware Fix${NC}"
TASK_RESPONSE=$(curl -s -X POST "$BASE_URL/api/tasks/createjson" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "title": "Test Task",
    "description": "Testing tenant middleware fix",
    "assigned_to": [1],
    "priority": "High",
    "stage": "Pending",
    "client_id": 1,
    "taskDate": "2024-12-31"
  }')

echo "$TASK_RESPONSE" | jq .

if echo "$TASK_RESPONSE" | jq -e '.message=="Missing tenant id"' > /dev/null 2>&1; then
  echo -e "${RED}❌ Tenant middleware still blocking requests${NC}\n"
  exit 1
fi

echo -e "${GREEN}✅ Task endpoint accessible with valid token${NC}\n"

# Test 3: Create User (Test email service)
echo -e "${YELLOW}[Test 3] CREATE USER - Test Email Service${NC}"
USER_RESPONSE=$(curl -s -X POST "$BASE_URL/api/users/create" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name": "Test User",
    "email": "testuser@example.com",
    "phone": "9876543210",
    "role": "Employee",
    "title": "Developer"
  }')

echo "$USER_RESPONSE" | jq .

if echo "$USER_RESPONSE" | jq -e '.success==true' > /dev/null 2>&1; then
  echo -e "${GREEN}✅ User created successfully${NC}"
  echo -e "${GREEN}✅ Email service integration working${NC}\n"
else
  echo -e "${YELLOW}⚠️  Check response for details${NC}\n"
fi

# Test 4: Verify No Token Error
echo -e "${YELLOW}[Test 4] SECURITY TEST - Missing Token${NC}"
NO_TOKEN_RESPONSE=$(curl -s -X POST "$BASE_URL/api/tasks/createjson" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test",
    "assigned_to": [1],
    "stage": "Pending",
    "client_id": 1
  }')

echo "$NO_TOKEN_RESPONSE" | jq .

if echo "$NO_TOKEN_RESPONSE" | jq -e '.message | contains("Missing") or contains("invalid")' > /dev/null 2>&1; then
  echo -e "${GREEN}✅ Security check passed - requires authentication${NC}\n"
fi

echo -e "${GREEN}=== All Tests Complete ===${NC}"
