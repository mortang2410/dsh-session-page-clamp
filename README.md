# dsh-session-page-clamp

A host-only DSH plugin that reduces oversized `session/page` history requests and `session/follow` opening snapshots to a configured message budget. The browser can continue requesting 500 messages; the host calls its original method with at most 50 by default. This does not limit the number of event records or bytes per message, change stored sessions, or modify the browser.

## Config

| Key | Default | Meaning |
| --- | --- | --- |
| `maxMessages` | `50` | Positive safe integer cap for explicit larger request budgets. |
| `enabled` | `true` | `false` installs no wrapper. |

Invalid configuration fails at activation with the plugin name and invalid field. Config uses Cordis's synchronous Standard Schema interface and has no runtime dependencies. For both methods, requests without `maxMessages`, requests at/below the cap, and invalid budgets go to the original service unchanged, by identity. Validation remains the original service's responsibility.

On a clamped request, the plugin makes a new request and turn-window object, lowers `turnWindow.minMessages` to the new budget only when it is a safe integer, and preserves `minTurns` and other fields. A malformed `minMessages` is copied unchanged for the original validator to reject. Both method wrappers forward the original receiver and AbortSignal and return the original result unchanged.

## Install and activate

This checkout has no build step, dependencies, client bundle, or UI.

1. Add `"dsh-session-page-clamp": "link:/home/wilder/git-repos/dsh-session-page-clamp"` to the [web profile manifest](</home/wilder/.dsh/profiles/web/package.json>) dependencies.
2. Append `"dsh-session-page-clamp"` to `dsh.profile.bundles` in the [manifest](</home/wilder/.dsh/profiles/web/package.json>). The bundle inserts its own `session-page-clamp` row, so do not duplicate a row in the profile patch.
3. Run `pnpm install` from `/home/wilder/.dsh/profiles/web` and confirm the [installed bundle symlink](</home/wilder/.dsh/profiles/web/node_modules/dsh-session-page-clamp>) points here.
4. Validate composition with `dsh --profile web --dump-config | grep -o 'session-page-clamp'`. Never print the full dump; it can contain secrets.
5. The dispatcher restarts the existing host once ready. Installation and composition alone do not prove activation. This workstream does not restart anything or start a server.

For later config changes, use the existing profile configuration surface or a same-id `session-page-clamp` override, preserving both config keys. That is a separate authorized change; this install does not edit the profile patch.

## Verify

Run `node --test` in this checkout. Tests cover all eight behavior-contract points, including follow snapshot clamping, identity pass-through, cleanup and duplicate mounts, plus the live verifier's full client-request/server-response envelopes and malformed-response failure through fake external commands.

After the host restart, run:

```bash
/home/wilder/git-repos/dsh-session-page-clamp/scripts/verify-live.sh
# Optional different session:
/home/wilder/git-repos/dsh-session-page-clamp/scripts/verify-live.sh session-example
```

The script reads the launch token from the user service journal without printing it, mints a cookie expecting HTTP 303, learns the latest session cursor by deliberately overshooting, and sends a `client-request` envelope for `session/page` with `maxMessages: 500`, `minMessages: 50`, and `minTurns: 3`. It validates the returned `server-response` envelope and reads `server-response.result.ok`, `server-response.result.error.message`, or `server-response.result.value` as appropriate. Output contains only auth status, cursor, response byte count, record count, and `hasMore`, never the token, cookie contents, or response records. The cookie file is mode 600 under `/home/wilder/.dsh/.scratch/session-page-clamp/` and is emptied on exit. Response bodies stay in memory, with a 32 MiB bound; no response body is written to scratch. The default session is the dispatcher's measured large session. The verifier was run against the live host on 2026-10-27 with this checkout: `cookie_mint_http=303`, `throughSeq=22372`, `bytes=1164500`, `records=226`, `hasMore=true`, exit 0. The host started at 03:32:37 before this fix and still runs the page-only wrapper, so that run verifies the envelope handling and returned 226 records with the live `page` clamp active; no unclamped count was recorded, so the clamp is consistent with the run but not isolated by it. The `follow` clamp in this checkout takes effect only after a host restart.

Compare the post-restart measurement with the dispatcher's baseline for the same session and cursor. A smaller page alone is not proof of which code ran if the history changed. Also check the plugin's mounted state and any activation error after restart. `python3 /home/wilder/.dsh/check-web-plugins.py web` checks installed bundle names and browser boot-graph registrations; this host-only plugin has no client half for that checker to execute.

## Implementation limits

Cordis 4 returns a new shadow-method Proxy for each contextual method read, so contextual method identity is not a valid activation check. Its contextual write trap also targets a transient shadow. The plugin therefore unwraps `ctx.sessionController[Symbol.for('cordis.original')]`, defines own `page` and `follow` properties on that shared raw service, and verifies each method by read-back. The gateway's contextual method Proxies then invoke their wrappers, which forward Cordis's shadow receiver unchanged so `this.ctx` and helper methods keep the invocation's context.

When there is no raw-original symbol, ordinary service objects retain assignment/read-back verification. A frozen instance or ignored proxy assignment falls back to its immediate prototype. If neither supported site works for either method, activation fails loudly and any earlier installation is restored. Prototype fallback affects all instances sharing that prototype until disposal. The real-Cordis integration test resolves Cordis from the installed profile, emulates the gateway's `Reflect.get`/`Reflect.apply` dispatch on the contextual receiver, and proves both methods are installed, with clamping, shadow helper behavior, original result identity, and restoration. It skips only if Cordis cannot be resolved; it ran, without skipping, on this host.

The first mount owns each wrapper. A second mount detects each method's Symbol and does not stack or change caps. Disposing the owner restores the exact original property descriptors/functions; inherited instance shadows are removed. A later remount wraps once. Duplicate mounts are not reference-counted.

This is a method-interposition seam rather than an upstream paging-policy extension point. A host upgrade can change its validity. The plugin clamps `page` requests and the opening snapshot budget passed through `follow`; it does not limit later events delivered by the follow stream or change any other RPC.

## Rollback

Remove only this dependency and bundles-list entry from the web profile manifest, run `pnpm install` there, and have the dispatcher restart the existing host. The bundle's inserted row then disappears automatically. Do not overwrite the complete manifest or lockfile with baseline copies when other sessions may have changed them. The repository is pushed to `origin` at https://github.com/mortang2410/dsh-session-page-clamp; `master` tracks it, with the fix commit `3861d5b` and the round-2 corrections on top.
