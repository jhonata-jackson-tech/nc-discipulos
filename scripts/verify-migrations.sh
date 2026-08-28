#!/usr/bin/env bash
# Aplica as migrations e o seed em um Postgres descartavel.
#
# Nao sobe a aplicacao: valida a sintaxe SQL, as constraints, os gatilhos e as
# regras de negocio em segundos, antes de qualquer deploy. Nao precisa de
# nenhum segredo - `db/roles.sql` fica de fora justamente por isso.
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

for file in db/migrations/*.sql; do
  echo "→ $(basename "$file")"
  docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -q -U postgres < "$file"
done

echo "→ seed.sql"
docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -q -U postgres < db/seed.sql
echo "→ seed.sql (segunda vez, conferindo idempotencia)"
docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -q -U postgres < db/seed.sql

echo "→ regras de negocio (db/tests/rules.sql)"
docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -q -U postgres < db/tests/rules.sql

echo "→ conferencias"
docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -f - <<'SQL'
\set ON_ERROR_STOP on
do $$
declare
  total int;
  rls_missing text;
  identidade uuid;
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

  -- A identidade da sessao e a peca que o PostgREST alimenta em producao:
  -- se `auth.uid()` deixar de ler as claims, a RLS inteira cai junto.
  perform set_config('request.jwt.claims',
                     '{"sub":"11111111-1111-1111-1111-111111111111"}', true);
  select auth.uid() into identidade;
  if identidade is distinct from '11111111-1111-1111-1111-111111111111'::uuid then
    raise exception 'auth.uid() nao esta lendo request.jwt.claims';
  end if;

  -- Conexao reaproveitada do pool: o GUC volta para string vazia, e nao para
  -- NULL. Se `auth.uid()` nao aguentar isso, o erro reaparece dentro de um
  -- gatilho, longe de qualquer pista.
  perform set_config('request.jwt.claims', '', true);
  if auth.uid() is not null then
    raise exception 'auth.uid() deveria ser nulo sem sessao';
  end if;

  raise notice 'seed: % integrantes, RLS ativa em todas as tabelas', total;
end;
$$;
SQL
echo "✓ migrations e seed aplicados sem erros"
