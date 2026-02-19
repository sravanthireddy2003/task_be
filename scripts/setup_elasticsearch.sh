#!/bin/bash

# =====================================================
# Elasticsearch Index Template Setup Script
# =====================================================

ELASTICSEARCH_HOST="http://localhost:9200"
TEMPLATE_FILE="./elasticsearch/audit_logs_mapping.json"

echo "Creating Elasticsearch index template for audit logs..."

# Apply template
curl -X PUT "${ELASTICSEARCH_HOST}/_index_template/audit-logs-template" \
  -H 'Content-Type: application/json' \
  -d @${TEMPLATE_FILE}

echo ""
echo "Creating ILM policy..."

# Create ILM policy
curl -X PUT "${ELASTICSEARCH_HOST}/_ilm/policy/audit-logs-policy" \
  -H 'Content-Type: application/json' \
  -d '{
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
}'

echo ""
echo "Creating write alias..."

# Create initial index with alias
curl -X PUT "${ELASTICSEARCH_HOST}/audit-logs-000001" \
  -H 'Content-Type: application/json' \
  -d '{
  "aliases": {
    "audit-logs-write": {
      "is_write_index": true
    }
  }
}'

echo ""
echo "Setup complete!"
echo "Verify: curl ${ELASTICSEARCH_HOST}/_cat/indices/audit-logs-*"
