#!/usr/bin/env bash
# Publica a versao atual na VPS.
#
# Rode dentro do diretorio do projeto, na propria maquina:
#
#   git pull && npm run deploy
#
# As migrations sao aplicadas pelo container `migrate` antes de a API e o
# PostgREST subirem - o compose garante essa ordem.
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "✗ falta o arquivo .env (copie de .env.example e preencha)." >&2
  exit 1
fi

echo "→ construindo as imagens"
docker compose build

echo "→ subindo (o banco fica de pe; so os servicos reiniciam)"
docker compose up -d

echo "→ estado dos servicos"
docker compose ps

echo "→ liberando imagens antigas"
docker image prune -f >/dev/null

echo "✓ publicado"
