#!/bin/sh
# =============================================================================
# Aplica papeis, migrations e - somente em banco vazio - o seed do GC.
#
# Roda a cada subida do compose e e seguro repetir: cada migration e aplicada
# uma unica vez, registrada em `migrations.applied`. O seed so entra quando
# ainda nao existe nenhum integrante, para nunca ressuscitar quem a lideranca
# desligou.
# =============================================================================
set -eu

# Onde estao migrations, seed e papeis. No container e `/db`; rodando direto no
# servidor (maquina cujo kernel nao aguenta o Postgres em container), aponte
# para a pasta do projeto: DB_DIR=/opt/cuidar-gc/db ./scripts/migrate.sh
DB_DIR="${DB_DIR:-/db}"

psql() { command psql -v ON_ERROR_STOP=1 --no-psqlrc -q "$@"; }

echo "[migrate] aguardando o banco..."
until pg_isready -q; do sleep 1; done

# O controle de migrations mora em um schema proprio: o PostgREST publica
# apenas `public`, entao nada disso vira API por acidente.
psql -c "create schema if not exists migrations;
         create table if not exists migrations.applied (
           version text primary key,
           applied_at timestamptz not null default now()
         );"

for arquivo in "$DB_DIR"/migrations/*.sql; do
  versao=$(basename "$arquivo")
  ja=$(psql -At -c "select 1 from migrations.applied where version = '$versao'")

  if [ "$ja" = "1" ]; then
    echo "[migrate] $versao (ja aplicada)"
    continue
  fi

  echo "[migrate] aplicando $versao"
  # Uma transacao por migration: ou entra inteira, ou nao entra.
  psql --single-transaction -f "$arquivo" \
    -c "insert into migrations.applied (version) values ('$versao');"
done

# Depois das migrations: os papeis `anon` e `authenticated`, de quem estes
# aqui herdam, nascem na primeira delas.
echo "[migrate] papeis de conexao"
psql -v authenticator_password="$AUTHENTICATOR_PASSWORD" \
     -v auth_service_password="$AUTH_SERVICE_PASSWORD" \
     -f "$DB_DIR"/roles.sql

if [ "${ENABLE_SERVICE_ROLE_API:-}" = "true" ]; then
  echo "[migrate] DESENVOLVIMENTO: liberando service_role pela API"
  psql -f "$DB_DIR"/dev-service-role.sql
fi

integrantes=$(psql -At -c "select count(*) from public.profiles")
if [ "$integrantes" = "0" ]; then
  echo "[migrate] banco vazio: aplicando o seed do GC"
  psql --single-transaction -f "$DB_DIR"/seed.sql
else
  echo "[migrate] $integrantes integrantes ja cadastrados: seed nao roda"
fi

# O PostgREST guarda o desenho do schema em memoria. Sem este aviso, uma
# funcao com assinatura nova responde "nao encontrada" ate alguem reiniciar o
# container - e o erro aparece na tela de quem esta usando, nao aqui.
echo "[migrate] avisando o PostgREST para reler o schema"
psql -c "notify pgrst, 'reload schema';"

echo "[migrate] pronto"
