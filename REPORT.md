# Session page clamp report

## Result and scope

The host-only plugin is implemented and link-installed in the web profile. All 20 automated tests passed, including an integration test with the real installed Cordis service proxy; no test was skipped. The filtered configuration dump and the unmodified profile checker passed. No host restart, second server, upstream edit, profile-patch edit, push, or remote creation was performed. Live activation and the post-restart large-session measurement remain dispatcher-owned and unverified.

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

The wrapper caps only explicit positive safe-integer `maxMessages` values above the cap. It makes a new request and nested turn-window object only on that branch, preserves absent fields and `minTurns`, and forwards `this`, the AbortSignal, the exact promise, and errors. Configuration defaults to `{ maxMessages: 50, enabled: true }`; disabled mode installs nothing. Invalid configuration fails with a named field error. A module-level Symbol prevents duplicate wrappers and an effect cleanup restores the exact original descriptor/function.

The original contextual identity requirement was disproved before completion. An isolated mount against real Cordis printed:

```text
Config defaults: {"maxMessages":50,"enabled":true}
Context method identity stable: false
Mount failure: dsh-session-page-clamp: cannot install wrapper on sessionController.page or its immediate prototype (read-back failed)
```

Cordis 4's [createTraceable implementation](</home/wilder/.npm-global/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/cordis/lib/index.js#L123-L151>) returns a new shadow-method Proxy for each contextual function read and redirects contextual writes to a transient shadow. Therefore contextual `svc.page === wrapper` is invalid even when a raw method patch is reachable. The dispatcher explicitly corrected acceptance point 5: "Install on the raw service object", "Define an own property page on raw whose value is the wrapper", and "Acceptance becomes behavioral, not identity".

The implementation unwraps `ctx.sessionController[Symbol.for('cordis.original')]`, falling back to the supplied object if absent. For Cordis it defines an own property on the raw service, verifies raw read-back, and preserves the shadow receiver with `original.apply(this, [effective, signal])`. Plain fake services retain instance assignment/read-back and immediate-prototype fallback, including the frozen-instance and ignored-proxy-write cases. A failed fallback is rolled back; an unreachable method throws at load.

The [real-Cordis integration test](</home/wilder/git-repos/dsh-session-page-clamp/test/clamp.test.mjs#L261-L330>) resolves Cordis from the installed profile, mounts through `ctx.plugin` and `fiber.await`, then emulates the gateway with `Reflect.apply(Reflect.get(receiver, 'page'), receiver, [request, signal])`. It proves the cap reaches the original, helper methods resolve the invocation context through `this`, signal and promise identity survive, and disposal restores both inherited and existing-own-descriptor cases. Only an unresolvable Cordis installation permits a skip; this run had zero skips.

Config is a dependency-free synchronous Standard Schema, matching the installed Cordis [resolveConfig contract](</home/wilder/.npm-global/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/cordis/lib/index.js#L949-L961>). Direct apply and actual Cordis validation both reject invalid values. No runtime dependency or build step was added.

## Directive and test map

| Contract / dispatcher directive | Implementation | Tests in exact output below |
| --- | --- | --- |
| 1: "call the original with a NEW request object" | Wrapper clamping branch in [host plugin](</home/wilder/git-repos/dsh-session-page-clamp/lib/index.js#L80-L94>) | 1 |
| 2: "minMessages must be clamped"; "Absent fields stay absent." | New turn-window object in [host plugin](</home/wilder/git-repos/dsh-session-page-clamp/lib/index.js#L85-L90>) | 2, 3 |
| 3: "same object identity" | Inert branch in [host plugin](</home/wilder/git-repos/dsh-session-page-clamp/lib/index.js#L81-L93>) | 4 |
| 4: defaults, disabled mode, "Invalid config must fail loudly at load" | [Config and apply validation](</home/wilder/git-repos/dsh-session-page-clamp/lib/index.js#L6-L33>) | 5, 6, 7; actual Cordis validation in 16 |
| 5 revised: "Install on the raw service object"; "Acceptance becomes behavioral, not identity" | [Raw service resolution and verified installation](</home/wilder/git-repos/dsh-session-page-clamp/lib/index.js#L69-L104>) | 8, 9, 10, 11, 12, 16 |
| 6: "Disposal must restore the exact original function"; "must not stack wrappers" | [Descriptor restoration](</home/wilder/git-repos/dsh-session-page-clamp/lib/index.js#L35-L63>) and Symbol | 8, 9, 10, 11, 13, 16 |
| 7: "forward this and the signal argument, return the original's promise" | [Ordinary non-async wrapper](</home/wilder/git-repos/dsh-session-page-clamp/lib/index.js#L80-L94>) | 14, 15, 16 |
| 8: "Only host code." | [Manifest](</home/wilder/git-repos/dsh-session-page-clamp/package.json>) and one-row [bundle patch](</home/wilder/git-repos/dsh-session-page-clamp/cordis.patch.yml>) | 17 |
| Live verifier: default/override session, 303 cookie mint, cursor discovery, metrics, no credential output | [Verification script](</home/wilder/git-repos/dsh-session-page-clamp/scripts/verify-live.sh>) with real Bash/Python and fake external commands | 18, 19, 20 |

The patch-row id is `session-page-clamp`. Its plugin name, package name, and profile bundles-list entry are all `dsh-session-page-clamp`. The row id is deliberately distinct from the package name and matches the supplied repository layout. The filtered composed dump below confirms that row is included; the checker confirms the bundle name matches its installed manifest. Neither proves this new host plugin is active before restart.

## Verification 1: exact node --test output

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

## Verification 4: local commit and clean tree

The implementation and this report will be committed locally, then the exact implementation SHA and post-commit status will be recorded here in a report-only follow-up commit. No remote will be created and nothing will be pushed. A commit cannot contain its own hash; the report records the implementation commit, while the dispatcher receives the final HEAD separately.

## Completion Gate

The tool is scoped to this delegated session's `/home/wilder/.dsh` workspace, not the new external repository. Its status is **BLOCKED**, not a pass. Reported blockers: the host change recorder does not record this session, no executable test command is detected for that workspace, and no completion attestation exists yet. Direct verification above covers this repository and the narrowly scoped install diff. A final attestation will preserve the workspace/recorder limitation and the unverified live activation rather than hide them.

## Activation, verification and rollback

The dispatcher must restart the existing host once all intended changes are ready. Then run the executable [live verifier](</home/wilder/git-repos/dsh-session-page-clamp/scripts/verify-live.sh>), with no argument for the dispatcher's measured large session or one alternate session ID. It mints the API cookie without printing credentials, expects HTTP 303, learns the cursor through an overshoot error, requests `maxMessages: 500`, and prints bytes, records and `hasMore`. Response bodies are bounded to 32 MiB in memory, not stored in scratch. Its mode-600 scratch cookie file is emptied on exit. The script's behavior was tested hermetically, not against live session content.

Host baseline: `MainPID=3153542`, `ExecMainStartTimestamp=Tue 2026-10-27 03:11:21 +07`. This workstream did not restart that service. New host-plugin activation, an actual reduced large-session response, and any session-creation check remain unverified until the dispatcher performs the post-restart checks. Existing browser-batch registration was verified separately by the checker.

Rollback: remove only `dsh-session-page-clamp` from the dependency and bundles-list entry in the [web manifest](</home/wilder/.dsh/profiles/web/package.json>), run `pnpm install` there, then have the dispatcher restart the existing host. Do not restore whole baseline files over other sessions' work. The bundle's inserted row disappears with bundle removal.

## Remaining risks

- The method patch and `cordis.original` symbol are an internal seam. Future Cordis or session-controller upgrades can invalidate it; the real-Cordis test guards the installed behavior but is not a future compatibility guarantee.
- Prototype fallback affects other instances sharing that exact prototype while mounted.
- Absent or invalid request budgets intentionally pass to the original validator. One message can contain many event records or bytes. `follow` snapshots and other RPCs are untouched.
- Duplicate mounts are skipped, not reference-counted. The first mount owns the cap and cleanup.
- Unit and isolated integration success, composed config, and browser registration do not prove live activation before restart.
