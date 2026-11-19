#!/usr/bin/env bash
# Un comando, dopo aver esportato i tre segreti:
#   CLOUDFLARE_API_TOKEN  (permesso Workers Scripts Edit + D1 Edit)
#   CLOUDFLARE_ACCOUNT_ID
#   ADMIN_PIN             (PIN del forno, almeno 6 caratteri)
set -euo pipefail
cd "$(dirname "$0")"

: "${CLOUDFLARE_API_TOKEN:?Manca CLOUDFLARE_API_TOKEN}"
: "${CLOUDFLARE_ACCOUNT_ID:?Manca CLOUDFLARE_ACCOUNT_ID}"
: "${ADMIN_PIN:?Manca ADMIN_PIN}"

if [[ ${#ADMIN_PIN} -lt 6 ]]; then
  echo "ADMIN_PIN troppo corto: minimo 6 caratteri." >&2
  exit 1
fi

PLACEHOLDER="00000000-0000-0000-0000-000000000000"
if grep -q "$PLACEHOLDER" wrangler.jsonc; then
  echo "Creo il database D1 gopizzago…"
  if ! create_out="$(npx wrangler d1 create gopizzago 2>&1)"; then
    printf '%s\n' "$create_out" >&2
    echo "Se il database esiste già, sostituisci $PLACEHOLDER in wrangler.jsonc con il suo database_id." >&2
    exit 1
  fi
  printf '%s\n' "$create_out"
  db_id="$(printf '%s\n' "$create_out" | sed -n 's/.*database_id = "\([^"]*\)".*/\1/p' | head -n 1)"
  if [[ -z "${db_id}" ]]; then
    echo "Non ho letto il database_id. Incollalo in wrangler.jsonc." >&2
    exit 1
  fi
  sed -i "s/${PLACEHOLDER}/${db_id}/" wrangler.jsonc
  echo "database_id scritto in wrangler.jsonc: ${db_id}"
fi

printf '%s' "$ADMIN_PIN" | npx wrangler secret put ADMIN_PIN
npx wrangler d1 migrations apply gopizzago --remote
npx wrangler deploy

cat <<'EOF'

Fatto. Copia l'URL https://gopizzago.<sottodominio>.workers.dev in public/gopizzago/config.json
come apiBase (senza slash finale) e rilancia il deploy del sito.
EOF
