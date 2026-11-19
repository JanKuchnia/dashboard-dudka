#!/usr/bin/env bash
# Jedno uruchomienie workera: bierze jedno zlecenie, buduje demo, publikuje.
# Wymaga w env: SUPABASE_URL SUPABASE_ANON_KEY SUPABASE_EMAIL SUPABASE_PASSWORD CLAUDE_CODE_OAUTH_TOKEN
set -uo pipefail
W="$(cd "$(dirname "$0")" && pwd)"
. "$W/lib.sh"
CFG="$HOME/.config/site-worker"
OWNER=JanKuchnia

token() {
  local f="$CFG/token.json" now; now=$(date +%s)
  if [ -f "$f" ] && [ "$(jq -r '.expires_at // 0' "$f")" -gt $((now + 120)) ]; then
    jq -r .access_token "$f"; return
  fi
  local r code
  r=$(curl -s -w '\n%{http_code}' "$SUPABASE_URL/auth/v1/token?grant_type=password" -H "apikey: $SUPABASE_ANON_KEY" \
    -H 'Content-Type: application/json' \
    -d "$(jq -n --arg e "$SUPABASE_EMAIL" --arg p "$SUPABASE_PASSWORD" '{email:$e,password:$p}')") || { echo "curl: brak połączenia z $SUPABASE_URL" >&2; return 1; }
  code=${r##*$'\n'}
  if [ "$code" != 200 ]; then echo "logowanie: HTTP $code: $(sed '$d' <<<"$r" | jq -r '.msg // .error_description // .message // .' 2>/dev/null)" >&2; return 1; fi
  sed '$d' <<<"$r" | jq '{access_token, expires_at}' > "$f.tmp" && mv "$f.tmp" "$f" && jq -r .access_token "$f"
}
rpc() { # rpc <name> <json body>
  curl -sf "$SUPABASE_URL/rest/v1/rpc/$1" -H "apikey: $SUPABASE_ANON_KEY" \
    -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d "$2"
}
finish() { # finish <GOTOWA|BLAD> <repo> <preview> <error>
  rpc finish_site_job "$(jq -n --arg id "$LEAD_ID" --arg s "$1" --arg r "$2" --arg p "$3" --arg e "$4" \
    '{p_lead_id:$id,p_status:$s,p_repo_url:(if $r=="" then null else $r end),p_preview_url:(if $p=="" then null else $p end),p_error:(if $e=="" then null else $e end)}')" >/dev/null
}

TOKEN=$(token) || { echo "logowanie do Supabase nie działa" >&2; exit 1; }
JOB=$(rpc claim_site_job '{}') || { echo "claim_site_job nie działa" >&2; exit 1; }
[ -z "$JOB" ] || [ "$JOB" = null ] && exit 0

LEAD_ID=$(jq -r .id <<<"$JOB")
DIR="$HOME/site-jobs/$LEAD_ID-$(date +%Y%m%d-%H%M)"
mkdir -p "$DIR/site" "$DIR/.claude/agents" && cp "$W/agents/"*.md "$DIR/.claude/agents/" && cd "$DIR" || exit 1

env -u SUPABASE_EMAIL -u SUPABASE_PASSWORD -u SUPABASE_ANON_KEY \
timeout 60m claude -p "$(cat "$W/prompt.md")
$JOB" \
  --settings "$W/claude-settings.json" \
  --mcp-config "$CFG/stitch.json" --strict-mcp-config \
  --allowedTools "Read Write Edit Bash WebSearch WebFetch Skill Agent mcp__stitch__*" \
  --permission-mode dontAsk \
  --model sonnet --max-budget-usd 4 \
  --output-format json --json-schema "$(cat "$W/result.schema.json")" \
  > run.json 2> run.err
RESULT=$(jq -c '.structured_output // (.result | fromjson? ) // {}' run.json 2>/dev/null || echo '{}')
OK=$(jq -r '.ok // false' <<<"$RESULT")
ERR=$(jq -r '.error // empty' <<<"$RESULT")

if [ "$OK" != true ] || [ ! -f site/index.html ]; then
  finish BLAD "" "" "${ERR:-Claude nie zwrócił gotowej strony (patrz $DIR/run.json)}"; exit 0
fi

NAME=$(jq -r .company_name <<<"$JOB"); CITY=$(jq -r '.city // empty' <<<"$JOB")
STITCH=$(jq -r '.stitch_project_url // empty' <<<"$RESULT")
cd site || exit 1
printf '# %s\n\nDemo strony głównej (lead %s).\n\nProjekt Stitch: %s\n' "$NAME" "$LEAD_ID" "$STITCH" > README.md
touch .nojekyll
grep -qi 'name="robots"' index.html || sed -i '0,/<head[^>]*>/s//&<meta name="robots" content="noindex">/' index.html

SLUG=$(slugify "$NAME")
desc=$(gh repo view "$OWNER/$SLUG" --json description -q .description 2>/dev/null) && EXISTS=1 || EXISTS=0
if [ $EXISTS = 1 ] && [ "$desc" != "lead $LEAD_ID" ]; then
  SLUG="$SLUG-$(slugify "$CITY")"
  desc=$(gh repo view "$OWNER/$SLUG" --json description -q .description 2>/dev/null) && EXISTS=1 || EXISTS=0
  if [ $EXISTS = 1 ] && [ "$desc" != "lead $LEAD_ID" ]; then
    finish BLAD "" "" "repo name taken: $SLUG"; exit 0
  fi
fi

git init -q -b main && git add -A && git commit -qm "Demo strony głównej" || { finish BLAD "" "" "git commit nie wyszedł"; exit 0; }
if [ $EXISTS = 1 ]; then
  git remote add origin "https://github.com/$OWNER/$SLUG.git" && git push -qf origin main
else
  gh repo create "$SLUG" --public --description "lead $LEAD_ID" --source . --push
fi || { finish BLAD "" "" "gh/git push nie wyszedł (repo $SLUG)"; exit 0; }
# Pages mogą już być włączone przy ponownym uruchomieniu: ignorujemy ten błąd
gh api -X POST "repos/$OWNER/$SLUG/pages" -f "source[branch]=main" -f "source[path]=/" >/dev/null 2>&1 || true

finish GOTOWA "https://github.com/$OWNER/$SLUG" "https://$(tr 'A-Z' 'a-z' <<<"$OWNER").github.io/$SLUG/" ""
