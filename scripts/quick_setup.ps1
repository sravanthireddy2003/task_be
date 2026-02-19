# =====================================================
# Quick Start Setup Script (Windows - Simplified)
# =====================================================

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  AUDIT SYSTEM - ELASTICSEARCH SETUP" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""

# Configuration
$ES_URL = "http://localhost:9200"  # Change to https if using SSL
$TEMPLATE_FILE = ".\elasticsearch\audit_logs_mapping.json"

# Step 1: Test Elasticsearch Connection
Write-Host "Step 1: Testing Elasticsearch connection..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri $ES_URL -UseBasicParsing
    Write-Host "✓ Elasticsearch is running!" -ForegroundColor Green
    Write-Host "  Version info: $($response.Content.Substring(0, [Math]::Min(100, $response.Content.Length)))" -ForegroundColor Gray
} catch {
    Write-Host "✗ Cannot connect to Elasticsearch" -ForegroundColor Red
    Write-Host "  Please verify:" -ForegroundColor Yellow
    Write-Host "    - Elasticsearch is running" -ForegroundColor Yellow
    Write-Host "    - URL is correct: $ES_URL" -ForegroundColor Yellow
    Write-Host "    - Try https://localhost:9200 if using SSL" -ForegroundColor Yellow
    exit 1
}

Write-Host ""

# Step 2: Load Template File
Write-Host "Step 2: Loading index template..." -ForegroundColor Yellow
if (-Not (Test-Path $TEMPLATE_FILE)) {
    Write-Host "✗ Template file not found: $TEMPLATE_FILE" -ForegroundColor Red
    exit 1
}

$templateContent = Get-Content $TEMPLATE_FILE -Raw
Write-Host "✓ Template file loaded" -ForegroundColor Green
Write-Host ""

# Step 3: Apply Index Template
Write-Host "Step 3: Applying index template to Elasticsearch..." -ForegroundColor Yellow
try {
    $headers = @{
        "Content-Type" = "application/json"
    }
    
    $response = Invoke-WebRequest `
        -Uri "$ES_URL/_index_template/audit-logs-template" `
        -Method Put `
        -Headers $headers `
        -Body $templateContent `
        -UseBasicParsing
    
    Write-Host "✓ Index template applied successfully!" -ForegroundColor Green
} catch {
    Write-Host "✗ Failed to apply template" -ForegroundColor Red
    Write-Host "  Error: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Step 4: Create ILM Policy
Write-Host "Step 4: Creating ILM policy..." -ForegroundColor Yellow
$ilmPolicy = @"
{
  "policy": {
    "phases": {
      "hot": {
        "actions": {
          "rollover": {
            "max_age": "7d",
            "max_size": "50GB"
          }
        }
      },
      "warm": {
        "min_age": "7d",
        "actions": {
          "shrink": {
            "number_of_shards": 1
          }
        }
      },
      "delete": {
        "min_age": "90d",
        "actions": {
          "delete": {}
        }
      }
    }
  }
}
"@

try {
    $response = Invoke-WebRequest `
        -Uri "$ES_URL/_ilm/policy/audit-logs-policy" `
        -Method Put `
        -Headers $headers `
        -Body $ilmPolicy `
        -UseBasicParsing
    
    Write-Host "✓ ILM policy created!" -ForegroundColor Green
} catch {
    Write-Host "⚠ ILM policy creation skipped (may already exist)" -ForegroundColor Yellow
}

Write-Host ""

# Step 5: Verify Setup
Write-Host "Step 5: Verifying setup..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest `
        -Uri "$ES_URL/_index_template/audit-logs-template" `
        -Method Get `
        -UseBasicParsing
    
    Write-Host "✓ Template verified!" -ForegroundColor Green
} catch {
    Write-Host "✗ Verification failed" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  ✓ ELASTICSEARCH SETUP COMPLETE!" -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "  1. Run database optimization:" -ForegroundColor White
Write-Host "     mysql -u root -p your_database < database\audit_logs_optimization.sql" -ForegroundColor Gray
Write-Host ""
Write-Host "  2. Test audit logger:" -ForegroundColor White
Write-Host "     node test_audit_system.js" -ForegroundColor Gray
Write-Host ""
Write-Host "  3. Configure and start Logstash" -ForegroundColor White
Write-Host "     (See REAL_IMPLEMENTATION_GUIDE.md - Phase 2)" -ForegroundColor Gray
Write-Host ""
