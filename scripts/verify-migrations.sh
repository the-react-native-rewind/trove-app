#!/usr/bin/env bash
# Apply migrations to a throwaway local database and run the RLS checks.
# Requires PostgreSQL with a superuser named postgres. Does not touch a hosted project.
#
# bootstrap.sql stubs storage.protect_delete (statement-level, so a delete that
# matches zero rows still fails). rls.sql expects delete_account_data to run
# under that trigger and to refuse authenticated. File removal itself is
# supabase/functions/delete-account (verify_jwt true), which this database
# check cannot call.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB="${TROVE_TEST_DB:-trove_migrate_test}"

psql_as() {
  sudo -u postgres psql -v ON_ERROR_STOP=1 "$@"
}

psql_as -d postgres -c "select pg_terminate_backend(pid) from pg_stat_activity where datname = '${DB}' and pid <> pg_backend_pid();" >/dev/null
psql_as -d postgres -c "drop database if exists ${DB};"
psql_as -d postgres -c "create database ${DB};"

psql_as -d "$DB" -f "$ROOT/supabase/tests/bootstrap.sql"
for file in "$ROOT"/supabase/migrations/*.sql; do
  echo "Applying $(basename "$file")"
  psql_as -d "$DB" -f "$file"
done
psql_as -d "$DB" -f "$ROOT/supabase/seed.sql"
psql_as -d "$DB" -f "$ROOT/supabase/tests/rls.sql"
echo "Migrations, seed, and RLS checks passed."
