# Session page clamp report

## Result and scope

The host-only plugin is implemented and linked into the currently running DSH host, as stated in the task context. The current suite has 27 passing automated tests, including follow snapshot coverage, malformed verifier-response handling, and an integration test with the real installed Cordis service proxy; no test was skipped. The filtered configuration dump and the unmodified profile checker passed in the earlier implementation work. This fix did not touch the linked install, restart a host or another server, or edit upstream or profile files. It is committed as `3861d5b` and pushed to `origin/master`; the round-2 corrections are committed on top. The verifier was then run live against the host and returned 226 records with the page-only build loaded (host started 03:32:37); no unclamped baseline was recorded, so the clamp is consistent with that run but not isolated by it. The `follow` clamp is not loaded until the host restarts.

## Review corrections

The browser's opening history snapshot reaches the server through `sessionController.follow`, so the plugin now shares one request-clamp helper between `page` and `follow`, installs each wrapper independently on the raw service, and restores both during cleanup. Follow tests cover an above-cap request, at/below-cap identity pass-through, turn-window clamping without mutation, cleanup restoration, and duplicate application for both methods. The real-Cordis integration test also verifies that both wrappers mount and restore through the contextual gateway path.

The live verifier now sends a `client-request` envelope (`type`, `rpcId`, `method`, and nested `payload.args.request`) and validates the matching `server-response` envelope before reading the nested `result.ok`, `result.error.message`, or `result.value`. Its tests use fake external commands and include a malformed-envelope failure case. The script was then run live against the host; the result is recorded under "Current follow-up verification".

The repository has `origin` at https://github.com/mortang2410/dsh-session-page-clamp. The reviewed baseline was `4ff1e078e1822c7dbb2de91ecafdbf73d7288a56`. The fix is committed as `3861d5b` and pushed to `origin/master`; the round-2 review corrections are committed on top of it.

## Files created

- [package.json](</home/wilder/git-repos/dsh-session-page-clamp/package.json>)
- [cordis.patch.yml](</home/wilder/git-repos/dsh-session-page-clamp/cordis.patch.yml>)
- [lib/index.js](</home/wilder/git-repos/dsh-session-page-clamp/lib/index.js>)
- [test/clamp.test.mjs](</home/wilder/git-repos/dsh-session-page-clamp/test/clamp.test.mjs>)
- [test/verify-live.test.mjs](</home/wilder/git-repos/dsh-session-page-clamp/test/verify-live.test.mjs>)
- [README.md](</home/wilder/git-repos/dsh-session-page-clamp/README.md>)
- [scripts/verify-live.sh](</home/wilder/git-repos/dsh-session-page-clamp/scripts/verify-live.sh>)
- [REPORT.md](</home/wilder/git-repos/dsh-session-page-clamp/REPORT.md>)

## Seam and dispatcher-approved contract correction

The shared wrapper helper caps only explicit positive safe-integer `maxMessages` values above the cap for both `page` and `follow`. It makes a new request and nested turn-window object only on that branch, preserves `minTurns` and other fields, and forwards `this`, the AbortSignal, the exact original result, and errors. Configuration defaults to `{ maxMessages: 50, enabled: true }`; disabled mode installs nothing. Invalid configuration fails with a named field error. Per-method Symbols prevent duplicate wrappers, and cleanup restores each exact original descriptor/function.

The original contextual identity requirement was disproved before completion. An isolated mount against real Cordis printed:

```text
Config defaults: {"maxMessages":50,"enabled":true}
Context method identity stable: false
Mount failure: dsh-session-page-clamp: cannot install wrapper on sessionController.page or its immediate prototype (read-back failed)
```

Cordis 4's [createTraceable implementation](</home/wilder/.npm-global/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/cordis/lib/index.js#L123-L151>) returns a new shadow-method Proxy for each contextual function read and redirects contextual writes to a transient shadow. Therefore contextual `svc.page === wrapper` is invalid even when a raw method patch is reachable. The dispatcher explicitly corrected acceptance point 5: "Install on the raw service object", "Define an own property page on raw whose value is the wrapper", and "Acceptance becomes behavioral, not identity".

The implementation unwraps `ctx.sessionController[Symbol.for('cordis.original')]`, falling back to the supplied object if absent. For Cordis it independently defines own `page` and `follow` properties on the raw service and verifies read-back for each. Each non-async wrapper preserves the shadow receiver with `original.apply(this, [effective, signal])`. Plain fake services retain instance assignment/read-back and immediate-prototype fallback, including the frozen-instance and ignored-proxy-write cases. If either method cannot be installed, any earlier installation is rolled back; an unreachable method throws at load.

The [real-Cordis integration test](</home/wilder/git-repos/dsh-session-page-clamp/test/clamp.test.mjs#L386-L475>) resolves Cordis from the installed profile, mounts through `ctx.plugin` and `fiber.await`, then emulates the gateway with `Reflect.apply(Reflect.get(receiver, method), receiver, [request, signal])` for both methods. It proves both caps reach the originals, helper methods resolve the test context label through `this`, signal and result identity survive, and disposal restores page and follow, including page's existing-own-descriptor case. Only an unresolvable Cordis installation permits a skip; this run had zero skips.

Config is a dependency-free synchronous Standard Schema, matching the installed Cordis [resolveConfig contract](</home/wilder/.npm-global/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/cordis/lib/index.js#L949-L961>). Direct apply and actual Cordis validation both reject invalid values. No runtime dependency or build step was added.

## Directive and test map

| Contract / dispatcher directive | Implementation | Current test numbers |
| --- | --- | --- |
| 1: "call the original with a NEW request object" | Shared clamp helper in [host plugin](</home/wilder/git-repos/dsh-session-page-clamp/lib/index.js#L68-L81>) | 1, 5, 22 |
| 2: "minMessages must be clamped"; "Absent fields stay absent." | Cloned turn-window handling in [host plugin](</home/wilder/git-repos/dsh-session-page-clamp/lib/index.js#L72-L79>) | 2, 3, 7, 8, 22 |
| 3: "same object identity" | Shared pass-through branch in [host plugin](</home/wilder/git-repos/dsh-session-page-clamp/lib/index.js#L68-L70>) | 4, 6 |
| 4: defaults, disabled mode, "Invalid config must fail loudly at load" | [Config and apply validation](</home/wilder/git-repos/dsh-session-page-clamp/lib/index.js#L9-L35>) | 10, 11, 12, 22 |
| 5 revised: "Install on the raw service object"; "Acceptance becomes behavioral, not identity" | [Raw service resolution and per-method installation](</home/wilder/git-repos/dsh-session-page-clamp/lib/index.js#L92-L130>) | 13-19, 22 |
| 6: "Disposal must restore the exact original function"; "must not stack wrappers" | [Per-method Symbols](</home/wilder/git-repos/dsh-session-page-clamp/lib/index.js#L4-L7>) and [descriptor restoration](</home/wilder/git-repos/dsh-session-page-clamp/lib/index.js#L38-L66>) | 13-19, 22 |
| 7: "forward this and the signal argument, return the original's promise" | [Ordinary non-async wrapper](</home/wilder/git-repos/dsh-session-page-clamp/lib/index.js#L83-L90>) | 20-22 |
| 8: "Only host code." | [Manifest](</home/wilder/git-repos/dsh-session-page-clamp/package.json>) and one-row [bundle patch](</home/wilder/git-repos/dsh-session-page-clamp/cordis.patch.yml>) | 23 |
| Live verifier: default/override session, 303 cookie mint, cursor discovery, metrics, no credential output | [Verifier's client-request/server-response envelope handling](</home/wilder/git-repos/dsh-session-page-clamp/scripts/verify-live.sh>) with fake external commands | 24-27 |

The patch-row id is `session-page-clamp`. Its plugin name, package name, and profile bundles-list entry are all `dsh-session-page-clamp`. The row id is deliberately distinct from the package name and matches the supplied repository layout. The filtered composed dump below confirms that row is included; the checker confirms the bundle name matches its installed manifest. The linked install is live in a running host per task context. The live run below measures the `page` clamp through that host; the `follow` clamp awaits a restart.

## Current follow-up verification

Command: `cd /home/wilder/git-repos/dsh-session-page-clamp && node --test`. Result: exit 0; 27 tests, 27 passed, 0 failed, 0 skipped. Exact TAP summary: `1..27`, `# tests 27`, `# pass 27`, `# fail 0`, `# skipped 0`. This run includes five direct follow tests, partial-install rollback, malformed-`minMessages` pass-through, duplicate-mount and Cordis coverage for both methods, the full nested verifier envelopes, and a malformed-response failure test.

`bash -n scripts/verify-live.sh && shellcheck scripts/verify-live.sh` and `git diff --check` exited 0.

Live verifier run against the running host (started 2026-10-27 03:32:37 with the page-only wrapper loaded): `scripts/verify-live.sh` printed `cookie_mint_http=303`, `throughSeq=22372`, `bytes=1164500`, `records=226`, `hasMore=true` and exited 0. This exercises the corrected `client-request`/`server-response` envelope and returned 226 records with the page-only build loaded (host started 03:32:37). No unclamped baseline was recorded for the same cursor, so the clamp is consistent with the run but not isolated by it. The `follow` clamp in this working tree is not loaded by the running process; it is verified by unit and real-Cordis tests only until a host restart.

Mutation check: a repository copy under the permitted scratch area had the wrapper's follow-method branch disabled, then ran `node --test --test-name-pattern='follow:'`. Exit 1; the above-cap, turn-window, and cleanup follow tests failed as expected, while the at/below-cap identity test passed. The scratch copy was moved to `/home/wilder/Trash/dsh-session-page-clamp/mutation-check` after collecting the result; the real repository was not mutated for this check. Round-2 mutations, also in scratch copies: deleting the partial-install rollback made `C5: a failed follow install rolls the page wrapper back` fail, and removing the safe-integer guard made `follow: malformed minMessages is copied but never coerced` and the C2 absent-fields test (test 3) fail.

## Round-2 review

Round 2 returned "minor fixes" with no P0-P2 findings (report: `/home/wilder/.dsh/.scratch/review-dsh-session-page-clamp/round2.md`). The P3 findings are fixed in this commit: the report states commit `3861d5b` instead of claiming an uncommitted tree (F1); the real-Cordis anchor and the gateway-emulation wording are corrected (F2); and a test now fails when the partial-install rollback is removed (F3). The in-process coercion of a malformed `turnWindow.minMessages` is closed by clamping only safe integers (C4), and the live-run wording no longer claims an isolated measurement (C8).

Accepted without change: duplicate mounts are still not reference-counted, and the module-local symbols matter only if the package loads twice in one process, which this profile's loader does not do (C6); the launch token still travels in the mint URL for the cookie exchange (C9).

Open, requiring a user decision: whether a missing profile should fail the test run instead of a visible skip (C2), and whether Config should get a native schema instead of the inspector's "unsupported" status for the hand-written Standard Schema (C3).

The round-3 closure check found only numbering and wording items (N1-N4), fixed in the commit that contains this report.

## Initial verification for the original page-only implementation

Run from `/home/wilder/git-repos/dsh-session-page-clamp`. Exit code: **0**.

```text
TAP version 13
# Subtest: C1: clamps an excessive safe integer with a new, non-mutating request
ok 1 - C1: clamps an excessive safe integer with a new, non-mutating request
  ---
  duration_ms: 1.06934
  type: 'test'
  ...
# Subtest: C2: clamps minMessages, preserves minTurns and leaves the nested caller object intact
ok 2 - C2: clamps minMessages, preserves minTurns and leaves the nested caller object intact
  ---
  duration_ms: 0.19194
  type: 'test'
  ...
# Subtest: C2: preserves smaller minMessages and absent fields
ok 3 - C2: preserves smaller minMessages and absent fields
  ---
  duration_ms: 0.168405
  type: 'test'
  ...
# Subtest: C3: absent, at-cap, below-cap and invalid maxMessages pass through by identity
ok 4 - C3: absent, at-cap, below-cap and invalid maxMessages pass through by identity
  ---
  duration_ms: 0.150492
  type: 'test'
  ...
# Subtest: C4: Config exposes Standard Schema defaults and apply uses the default cap
ok 5 - C4: Config exposes Standard Schema defaults and apply uses the default cap
  ---
  duration_ms: 0.123791
  type: 'test'
  ...
# Subtest: C4: disabled mode installs no wrapper or effect, including on a frozen service
ok 6 - C4: disabled mode installs no wrapper or effect, including on a frozen service
  ---
  duration_ms: 0.080671
  type: 'test'
  ...
# Subtest: C4: invalid config fails loudly before any wrapping, including when disabled
ok 7 - C4: invalid config fails loudly before any wrapping, including when disabled
  ---
  duration_ms: 0.707183
  type: 'test'
  ...
# Subtest: C5/C6: installs on the reached instance, restores its exact own descriptor
ok 8 - C5/C6: installs on the reached instance, restores its exact own descriptor
  ---
  duration_ms: 0.106459
  type: 'test'
  ...
# Subtest: C5/C6: inherited instance shadow is removed on disposal
ok 9 - C5/C6: inherited instance shadow is removed on disposal
  ---
  duration_ms: 0.215673
  type: 'test'
  ...
# Subtest: C5/C6: frozen instance falls back to its mutable prototype and restores it
ok 10 - C5/C6: frozen instance falls back to its mutable prototype and restores it
  ---
  duration_ms: 0.27789
  type: 'test'
  ...
# Subtest: C5: read-back detects a proxy ignoring successful instance assignment
ok 11 - C5: read-back detects a proxy ignoring successful instance assignment
  ---
  duration_ms: 0.152966
  type: 'test'
  ...
# Subtest: C5: neither patch site works: fail loudly without leaving a prototype wrapper
ok 12 - C5: neither patch site works: fail loudly without leaving a prototype wrapper
  ---
  duration_ms: 0.216925
  type: 'test'
  ...
# Subtest: C6: duplicate mounts do not stack; dispose and remount wrap exactly once
ok 13 - C6: duplicate mounts do not stack; dispose and remount wrap exactly once
  ---
  duration_ms: 0.115797
  type: 'test'
  ...
# Subtest: C7: forwards this and AbortSignal and returns the exact original promise
ok 14 - C7: forwards this and AbortSignal and returns the exact original promise
  ---
  duration_ms: 0.493553
  type: 'test'
  ...
# Subtest: C7: synchronous errors and rejected promises propagate unchanged without logging
ok 15 - C7: synchronous errors and rejected promises propagate unchanged without logging
  ---
  duration_ms: 0.20884
  type: 'test'
  ...
# Subtest: C5 revised/C6/C7: real Cordis gateway dispatch clamps through raw service and preserves shadow helpers
ok 16 - C5 revised/C6/C7: real Cordis gateway dispatch clamps through raw service and preserves shadow helpers
  ---
  duration_ms: 6.470767
  type: 'test'
  ...
# Subtest: C8: host-only package has one insert row, no client half, no runtime dependencies
ok 17 - C8: host-only package has one insert row, no client half, no runtime dependencies
  ---
  duration_ms: 5.691589
  type: 'test'
  ...
# Subtest: live verifier: default session, cursor discovery, request shape and exact byte/count summary
ok 18 - live verifier: default session, cursor discovery, request shape and exact byte/count summary
  ---
  duration_ms: 131.981376
  type: 'test'
  ...
# Subtest: live verifier: accepts a session override
ok 19 - live verifier: accepts a session override
  ---
  duration_ms: 128.776179
  type: 'test'
  ...
# Subtest: live verifier: fails on missing token, non-303 auth, unexpected cursor or failed page without content disclosure
ok 20 - live verifier: fails on missing token, non-303 auth, unexpected cursor or failed page without content disclosure
  ---
  duration_ms: 209.584029
  type: 'test'
  ...
1..20
# tests 20
# suites 0
# pass 20
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 514.678098
```

Additional checks: `bash -n scripts/verify-live.sh`, `shellcheck scripts/verify-live.sh`, and `git diff --check` all exited 0 with no output.

Mutation evidence, restored before the final passing suite:

- Replacing the effective cap with the caller's original budget made tests 1 and 2 fail: actual `maxMessages: 500`, expected 50 and 20. `node --test --test-name-pattern='C1:|C2: clamps'` exited 1, with 2 failures.
- Replacing raw-service resolution with the contextual proxy made test 16 fail with the expected `cannot install wrapper ... (read-back failed)` load error. `node --test --test-name-pattern='real Cordis gateway'` exited 1, with 1 failure.

## Verification 2: filtered composition output

Run from `/home/wilder/.dsh/profiles/web`:

```bash
dsh --profile web --dump-config | grep -o 'session-page-clamp'
```

Exact stdout, exit code **0** with pipeline failure detection enabled:

```text
session-page-clamp
session-page-clamp
session-page-clamp
```

The full dump was never printed or persisted.

## Verification 3: profile checker

The checker was run unmodified, with disk-backed `TMPDIR=/home/wilder/.dsh/.scratch/check-web-plugins-tmp`, without a file-size cap. Command:

```bash
python3 /home/wilder/.dsh/check-web-plugins.py web
```

Exact stdout and recorded exit:

```text
PASS: profile web serves a boot graph where every plugin registers
Verified: every boot graph id registered exactly once against the served
bytes, and every bundle key matches its installed package name.
exit=0
```

Scratch directory size afterward:

```text
4.0K	/home/wilder/.dsh/.scratch/check-web-plugins-tmp
```

Scope: the checker validates installed bundle package names and registration calls from browser batch bytes already served by the running host. This host-only plugin has no client half, so it cannot prove the new host wrapper mounted or reduced a response. No plugin id failed this run.

An earlier attempt imposed a 900 KiB file-size cap and exited 1 at the checker's batch write with `OSError: [Errno 27] File too large`. The dispatcher clarified that the scratch cap does not apply to required checker batch files and ordered the uncapped rerun above. The earlier environment-induced failure is not a plugin failure or activation result.

## Installation diff and hashes

Only the profile [manifest](</home/wilder/.dsh/profiles/web/package.json>) and pnpm-generated [lockfile](</home/wilder/.dsh/profiles/web/pnpm-lock.yaml>) changed outside this new repository. The installed bundle symlink resolves to `/home/wilder/git-repos/dsh-session-page-clamp`. The profile patch was not edited.

| Profile file | SHA256 first 16 characters before | After |
| --- | --- | --- |
| [package.json](</home/wilder/.dsh/profiles/web/package.json>) | `1626ca067fe6dce8` | `b7af06fe914e3ffd` |
| [pnpm-lock.yaml](</home/wilder/.dsh/profiles/web/pnpm-lock.yaml>) | `01e91e3a9aad0488` | `17d3fd68c7f7e423` |

Baseline copies remain at [package.json backup](</home/wilder/.dsh/.scratch/session-page-clamp/package.json>) and [pnpm-lock.yaml backup](</home/wilder/.dsh/.scratch/session-page-clamp/pnpm-lock.yaml>), both below 1 MiB. These are attribution backups, not permission to overwrite concurrent profile changes.

Exact manifest diff:

```diff
@@ -35,7 +35,8 @@
         "dsh-spend",
         "@local/peekaboo-mac-bridge",
         "dsh-temp-session-plugin",
-        "dsh-session-header-cache"
+        "dsh-session-header-cache",
+        "dsh-session-page-clamp"
@@ -71,6 +72,7 @@
     "dsh-permission-rules": "0.7.10",
     "dsh-plugin-save-token": "github:vibe-any/dsh-plugin-save-token",
     "dsh-session-header-cache": "link:/home/wilder/git-repos/dsh-session-header-cache",
+    "dsh-session-page-clamp": "link:/home/wilder/git-repos/dsh-session-page-clamp",
     "dsh-smooth-stream": "link:/home/wilder/git-repos/dsh-smooth-stream",
```

Exact lockfile change:

```diff
@@ -116,6 +116,9 @@
       dsh-session-header-cache:
         specifier: link:/home/wilder/git-repos/dsh-session-header-cache
         version: link:../../../git-repos/dsh-session-header-cache
+      dsh-session-page-clamp:
+        specifier: link:/home/wilder/git-repos/dsh-session-page-clamp
+        version: link:../../../git-repos/dsh-session-page-clamp
       dsh-smooth-stream:
```

`pnpm install` exited 0 in 160 ms using pnpm v12.14.0. Its output reported `Packages: -72`, `resolved 166, reused 166, downloaded 0, added 0` and `+ dsh-session-page-clamp <- ../../../git-repos/dsh-session-page-clamp`. The package manager pruned 72 entries as part of its normal resolution; no unrelated manifest or lockfile entry was changed. It also reported deprecated subdependencies, peer warnings, and existing `@liustack/modsearch` skills awaiting approval; no approval or additional dependency install was performed.

## Repository and remote state

The repository has `origin` at https://github.com/mortang2410/dsh-session-page-clamp. The reviewed baseline was `4ff1e078e1822c7dbb2de91ecafdbf73d7288a56`. The fix commit is `3861d5b`, pushed to `origin/master`; the round-2 corrections are committed on top.

## Completion Gate

The current gate status is **BLOCKED**, not a pass, because the gate is scoped to this session's `/home/wilder/.dsh` workspace rather than this repository. It reports no change record and no executable tests detected for that workspace. This is a scope/recorder limitation, not a failure of this repository's direct `node --test`, shell, or diff checks. Live `page` behavior is verified by the verifier run above; live `follow` behavior remains unverified until a restart.

## Activation, verification and rollback

The executable [live verifier](</home/wilder/git-repos/dsh-session-page-clamp/scripts/verify-live.sh>) was run against the running host before this fix was committed; it printed the page result recorded under "Current follow-up verification". It mints the API cookie without printing credentials, expects HTTP 303, sends the full `client-request` envelope for `session/page`, learns the cursor through the nested past-cursor error, then validates `server-response.result.value` and prints bytes, records, and `hasMore`. Response bodies are bounded to 32 MiB in memory, not stored in scratch. Its mode-600 scratch cookie file is emptied on exit. A post-restart follow check still needs a host restart; the verifier itself covers `session/page`, not `session/follow`. This task did not restart the host.

The linked install is live in a running host per task context, and this fix did not restart the host or inspect the installed copy. The live `session/page` request returned 226 records with the page-only build loaded (host started 03:32:37); no unclamped baseline was taken, and no live `session/follow` request was made. Session creation was not tested. Existing browser-batch registration was verified separately by the earlier checker.

Rollback: remove only `dsh-session-page-clamp` from the dependency and bundles-list entry in the [web manifest](</home/wilder/.dsh/profiles/web/package.json>), run `pnpm install` there, then have the dispatcher restart the existing host. Do not restore whole baseline files over other sessions' work. The bundle's inserted row disappears with bundle removal.

## Remaining risks

- The method patch and `cordis.original` symbol are an internal seam. Future Cordis or session-controller upgrades can invalidate it; the real-Cordis test guards the installed behavior but is not a future compatibility guarantee.
- Prototype fallback affects other instances sharing that exact prototype while mounted.
- Absent or invalid request budgets intentionally pass to the original validator. One message can contain many event records or bytes. The opening snapshot budget passed through `follow` is clamped; later follow-stream events and other RPCs are not.
- Duplicate mounts are skipped, not reference-counted. The first mount owns the cap and cleanup.
- Unit and isolated integration success, composed config, and browser registration do not prove how the live host currently handles page/follow requests; no live request was made.
