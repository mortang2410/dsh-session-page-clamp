import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

// Stub only external commands, not the verifier's control flow or JSON parsing.
// The cookie path is /dev/null and the stubs never touch real authentication.
const harness = String.raw`
journalctl() {
  if [[ "$MODE" != missing-token ]]; then printf 'token=%s\n' "$FAKE_TOKEN"; fi
}
mkdir() { :; }
mktemp() { printf '/dev/null\n'; }
chmod() { :; }
curl() {
  if [[ "$*" == *'?token='* ]]; then
    if [[ "$MODE" == bad-auth ]]; then printf 401; else printf 303; fi
    return
  fi
  local data=
  while (($#)); do
    if [[ "$1" == --data-binary ]]; then data=$2; shift; fi
    shift
  done
  printf '%s' "$data" | python3 -c '
import json, os, sys
request = json.load(sys.stdin)["args"]["request"]
assert request["address"] == {"kind": "session", "sessionId": os.environ["EXPECTED_SESSION"]}
assert request["maxMessages"] == 500
assert request["turnWindow"] == {"minMessages": 50, "minTurns": 3}
if request["throughSeq"] == 999999999:
    message = "unrelated failure" if os.environ["MODE"] == "bad-cursor" else "past cursor 123"
    print(json.dumps({"ok": False, "error": {"message": message}}))
else:
    assert request["throughSeq"] == 123
    if os.environ["MODE"] == "bad-page":
        print(json.dumps({"ok": False, "error": {"message": "private content"}}))
    else:
        print(json.dumps({"ok": True, "value": {"records": [{"type": "event"}], "hasMore": True}}))
'
}
export -f journalctl mkdir mktemp chmod curl
bash "$SCRIPT" "$@"
`

function run(mode = 'ok', override) {
  return spawnSync('bash', ['-c', harness, 'verifier-test', ...(override ? [override] : [])], {
    encoding: 'utf8',
    timeout: 5000,
    maxBuffer: 65536,
    env: {
      ...process.env,
      SCRIPT: fileURLToPath(new URL('../scripts/verify-live.sh', import.meta.url)),
      MODE: mode,
      FAKE_TOKEN: 'fixture-token-that-is-not-authentication-123456',
      EXPECTED_SESSION: override ?? 'session-ac616589-5409-4981-a481-1887c3848f18',
    },
  })
}

test('live verifier: default session, cursor discovery, request shape and exact byte/count summary', () => {
  const result = run()
  assert.equal(result.status, 0, result.stderr)
  // Python json.dumps in the independent curl stub emits spaces and a newline.
  const wire = '{"ok": true, "value": {"records": [{"type": "event"}], "hasMore": true}}\n'
  assert.equal(result.stdout, `cookie_mint_http=303\nthroughSeq=123\nbytes=${Buffer.byteLength(wire)}\nrecords=1\nhasMore=true\n`)
  assert.equal(result.stderr, '')
  assert.doesNotMatch(result.stdout, /fixture-token|private content|cookie contents/)
})

test('live verifier: accepts a session override', () => {
  const result = run('ok', 'session-override')
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /records=1\nhasMore=true/)
})

test('live verifier: fails on missing token, non-303 auth, unexpected cursor or failed page without content disclosure', () => {
  for (const [mode, message] of [
    ['missing-token', /no launch token/],
    ['bad-auth', /HTTP 401 \(expected 303\)/],
    ['bad-cursor', /expected past-cursor error/],
    ['bad-page', /valid successful page/],
  ]) {
    const result = run(mode)
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, message)
    assert.doesNotMatch(result.stdout + result.stderr, /fixture-token|private content|token=/)
    assert.doesNotMatch(result.stdout, /records=|bytes=|hasMore=/)
  }
})
