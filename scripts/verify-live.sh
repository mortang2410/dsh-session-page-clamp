#!/usr/bin/env bash
# Run only after the dispatcher restarts the existing DSH host.
set +x
set -euo pipefail
umask 077

SESSION=${1:-session-ac616589-5409-4981-a481-1887c3848f18}
BASE=http://127.0.0.1:3080
SCRATCH=/home/wilder/.dsh/.scratch/session-page-clamp
mkdir -p "$SCRATCH"
jar=$(mktemp "$SCRATCH/cookies.XXXXXX")
chmod 600 "$jar"
# Leave no authentication material behind, even if a request fails.
trap ': > "$jar"' EXIT

TOKEN=$(journalctl --user -u dsh-web.service -o cat | grep -o 'token=[A-Za-z0-9_-]\{32,\}' | tail -1 | cut -d= -f2) || TOKEN=
if [[ -z "$TOKEN" ]]; then
  printf 'ERROR: no launch token found in the service journal\n' >&2
  exit 1
fi
status=$(curl -s --max-time 30 -o /dev/null -c "$jar" "$BASE/?token=$TOKEN" -w '%{http_code}')
unset TOKEN
if [[ "$status" != 303 ]]; then
  printf 'ERROR: cookie mint returned HTTP %s (expected 303)\n' "$status" >&2
  exit 1
fi
printf 'cookie_mint_http=%s\n' "$status"

payload() {
  python3 -c '
import json, sys
print(json.dumps({"args": {"request": {
    "address": {"kind": "session", "sessionId": sys.argv[1]},
    "throughSeq": int(sys.argv[2]), "maxMessages": 500,
    "turnWindow": {"minMessages": 50, "minTurns": 3}
}}}))
' "$SESSION" "$1"
}

post_page() {
  curl -s --max-time 60 -b "$jar" -H 'content-type: application/json' \
    --data-binary "$(payload "$1")" "$BASE/api/session/page"
}

cursor=$(post_page 999999999 | python3 -c '
import json, re, sys
body = sys.stdin.buffer.read(1048576)
try:
    result = json.loads(body)
    message = result.get("error", {}).get("message", "")
    match = re.search(r"past cursor (\d+)", message)
    if result.get("ok") is not False or match is None:
        raise ValueError()
    print(match.group(1))
except (ValueError, TypeError, AttributeError):
    sys.exit("ERROR: overshoot did not return the expected past-cursor error")
')
printf 'throughSeq=%s\n' "$cursor"
# Keep response bytes in memory, not a quota-sensitive scratch file. Do not
# print records, request content, cookies, or the launch token.
post_page "$cursor" | python3 -c '
import json, sys
limit = 32 * 1024 * 1024
body = sys.stdin.buffer.read(limit + 1)
if len(body) > limit:
    sys.exit("ERROR: page response exceeded the 32 MiB in-memory verification limit")
try:
    result = json.loads(body)
    page = result["value"]
    if result.get("ok") is not True or not isinstance(page["records"], list) or type(page["hasMore"]) is not bool:
        raise ValueError()
except (ValueError, TypeError, KeyError):
    sys.exit("ERROR: session/page did not return a valid successful page")
print("bytes=" + str(len(body)))
print("records=" + str(len(page["records"])))
print("hasMore=" + str(page["hasMore"]).lower())
'
