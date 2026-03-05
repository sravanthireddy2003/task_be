# =====================================================
# Elasticsearch Index Template Setup Script (Windows)
# =====================================================

$ELASTICSEARCH_HOST = "http://localhost:9200"
$TEMPLATE_FILE = ".\elasticsearch\audit_logs_mapping.json"

Write-Host "Creating Elasticsearch index template for audit logs..." -ForegroundColor Green

# Apply template
$templateContent = Get-Content $TEMPLATE_FILE -Raw
Invoke-RestMethod -Uri "$ELASTICSEARCH_HOST/_index_template/audit-logs-template" `
  -Method Put `
  -ContentType "application/json" `
  -Body $templateContent

Write-Host ""
Write-Host "Creating ILM policy..." -ForegroundColor Green

# Create ILM policy
$ilmPolicy = @{
  policy = @{
    phases = @{
      hot = @{
        actions = @{
          rollover = @{
            max_age = "7d"
            max_size = "50GB"
          }
        }
      }
      warm = @{
        min_age = "7d"
        actions = @{
          shrink = @{
            number_of_shards = 1
          }
        }
      }
      delete = @{
        min_age = "90d"
        actions = @{
          delete = @{}
        }
      }
    }
  }
} | ConvertTo-Json -Depth 10

Invoke-RestMethod -Uri "$ELASTICSEARCH_HOST/_ilm/policy/audit-logs-policy" `
  -Method Put `
  -ContentType "application/json" `
  -Body $ilmPolicy

Write-Host ""
Write-Host "Creating write alias..." -ForegroundColor Green

# Create initial index with alias
$initialIndex = @{
  aliases = @{
    "audit-logs-write" = @{
      is_write_index = $true
    }
  }
} | ConvertTo-Json -Depth 5

Invoke-RestMethod -Uri "$ELASTICSEARCH_HOST/audit-logs-000001" `
  -Method Put `
  -ContentType "application/json" `
  -Body $initialIndex

Write-Host ""
Write-Host "Setup complete!" -ForegroundColor Green
Write-Host "Verify: Invoke-RestMethod -Uri $ELASTICSEARCH_HOST/_cat/indices/audit-logs-* -Method Get"
