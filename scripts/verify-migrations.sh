#!/usr/bin/env bash
# Aplica as migrations e o seed em um Postgres descartavel.
#
# Nao substitui o Supabase local (`supabase start`), mas valida rapidamente a
# sintaxe SQL, as constraints e os gatilhos antes de qualquer deploy.
#
#   ./scripts/verify-migrations.sh
set -euo pipefail

CONTAINER="cuidar-gc-verify"
IMAGE="postgres:17-alpine"

cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup

echo "→ subindo $IMAGE"
docker run -d --name "$CONTAINER" -e POSTGRES_PASSWORD=postgres "$IMAGE" >/dev/null

until docker exec "$CONTAINER" pg_isready -U postgres >/dev/null 2>&1; do sleep 0.5; done

# Stubs do que o Supabase fornece em producao: schema auth, roles e auth.uid().
docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres <<'SQL' >/dev/null
create schema if not exists auth;
create schema if not exists extensions;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb
);
create or replace function auth.uid() returns uuid
  language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
do $$ begin
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin;
exception when duplicate_object then null; end $$;
SQL

for file in supabase/migrations/*.sql; do
  echo "→ $(basename "$file")"
  docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -q -U postgres < "$file"
done

echo "→ seed.sql"
docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -q -U postgres < supabase/seed.sql
echo "→ seed.sql (segunda vez, conferindo idempotencia)"
docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -q -U postgres < supabase/seed.sql

echo "→ regras de negocio (supabase/tests/rules.sql)"
docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -q -U postgres < supabase/tests/rules.sql

echo "→ conferencias"
docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -f - <<'SQL'
\set ON_ERROR_STOP on
do $$
declare
  total int;
  rls_missing text;
begin
  select count(*) into total from public.profiles;
  if total <> 33 then
    raise exception 'esperava 33 integrantes no seed, encontrei %', total;
  end if;

  select string_agg(tablename, ', ') into rls_missing
    from pg_tables t
   where t.schemaname = 'public'
     and not exists (
       select 1 from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = t.tablename and c.relrowsecurity
     );
  if rls_missing is not null then
    raise exception 'tabelas sem Row Level Security: %', rls_missing;
  end if;

  raise notice 'seed: % integrantes, RLS ativa em todas as tabelas', total;
end;
$$;
SQL
echo "✓ migrations e seed aplicados sem erros"
