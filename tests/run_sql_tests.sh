#!/usr/bin/env bash
# Runs tests/memberships_sql_test.sql on a throwaway local Postgres (needs postgres 14+ binaries).
set -euo pipefail
cd "$(dirname "$0")/.."
BIN=$(ls -d /usr/lib/postgresql/*/bin | tail -1)
DIR=$(mktemp -d); chown postgres "$DIR" 2>/dev/null || true
run() { if [ "$(id -u)" = 0 ]; then su postgres -c "$*"; else bash -c "$*"; fi; }
run "$BIN/initdb -D $DIR/data -A trust >/dev/null"
run "$BIN/pg_ctl -D $DIR/data -o '-p 55432 -k $DIR' -l $DIR/log -w start >/dev/null"
trap 'run "$BIN/pg_ctl -D $DIR/data -m immediate stop >/dev/null" || true; rm -rf "$DIR"' EXIT
run "psql -h $DIR -p 55432 -d postgres -q -c 'create database t'"
run "cd $PWD && psql -h $DIR -p 55432 -d t -q -f tests/memberships_sql_test.sql" 2>&1 | grep -v '^$'
