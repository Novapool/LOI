#!/bin/bash

# Load environment variables from .env.local
source .env.local

# Check if secret exists
if [ -z "$CLEAN_DB_SECRET" ]; then
    echo "Error: CLEAN_DB_SECRET not found in .env.local"
    exit 1
fi

# Remove quotes from secret if present
SECRET=$(echo $CLEAN_DB_SECRET | tr -d '"')

# Extract project reference from URL
PROJECT_REF="vlewnzqhrtvqjnujiozx"
FUNCTION_URL="https://${PROJECT_REF}.supabase.co/functions/v1/clean_database"

echo "=== Database Cleanup ==="
echo ""

# Check for dry-run flag
if [ "$1" = "--dry-run" ]; then
    FUNCTION_URL="${FUNCTION_URL}?dry_run=true"
    echo "Running in DRY-RUN mode (no data will be deleted)"
    echo ""
else
    echo "⚠️  WARNING: This will DELETE ALL DATA from your database!"
    echo ""
    read -p "Are you sure? Type 'yes' to confirm: " -r
    echo ""

    if [ "$REPLY" != "yes" ]; then
        echo "Cancelled."
        exit 0
    fi
fi

echo "Calling: $FUNCTION_URL"
echo ""

# Invoke the function
curl -X POST "$FUNCTION_URL" \
    -H "x-clean-secret: $SECRET" \
    -H "Authorization: Bearer $VITE_SUPABASE_ANON_KEY" \
    -H "Content-Type: application/json"

echo ""
echo ""
echo "Done!"
