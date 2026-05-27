#!/usr/bin/env bash
# Postgres initialisation script
# Creates the application database, user, and enables required extensions
set -e

DB_NAME="${DB_NAME:-loan_platform}"
DB_USER="${DB_USERNAME:-app_user}"
DB_PASS="${DB_PASSWORD:-app_password}"

echo "🐘 Initialising PostgreSQL for Loan Platform…"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" << SQL

-- ── Application database ──────────────────────────────────────────────────────
SELECT 'CREATE DATABASE $DB_NAME'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$DB_NAME')\gexec

-- ── Application user ──────────────────────────────────────────────────────────
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '$DB_USER') THEN
    CREATE ROLE $DB_USER LOGIN PASSWORD '$DB_PASS';
  END IF;
END
\$\$;

GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;
SQL

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$DB_NAME" << SQL

-- ── Extensions ────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";      -- for fuzzy search

-- ── RLS helper ────────────────────────────────────────────────────────────────
-- Custom GUC for tenant context; set by the application before each query
ALTER DATABASE $DB_NAME SET "app.current_tenant_id" = '';

-- Grant schema permissions
GRANT USAGE ON SCHEMA public TO $DB_USER;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO $DB_USER;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO $DB_USER;

SQL

echo "✅ PostgreSQL initialisation complete (database: $DB_NAME, user: $DB_USER)"
